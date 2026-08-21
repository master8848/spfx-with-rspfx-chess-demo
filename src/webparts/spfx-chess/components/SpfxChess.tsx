import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from 'solid-js';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { Chess, type Square } from 'chess.js';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { EngineClient, type SearchResult } from '../engine/client';
import { ELO_LEVELS, eloConfig } from '../engine/elo';
import type { PieceColor, PieceKind } from '../game/model';
import { GameStore, type SavedGame, type SavedMove, type StoreMode } from '../services/gameStore';
import ChessBoard from './ChessBoard';
import MoveHistory from './MoveHistory';
import GamesPanel from './GamesPanel';
import PromotionPicker from './PromotionPicker';
import GameOverOverlay, { type SaveState } from './GameOverOverlay';
import '../styles/app.css';

export interface ISpfxChessProps {
  eloKey: string;
  playerColor: 'w' | 'b' | 'random';
  playerName: string;
  listName: string;
  autosave: boolean;
  context: WebPartContext;
}

type Status = 'setup' | 'your-turn' | 'thinking' | 'game-over' | 'viewing';

interface EngineStatus {
  state: 'loading' | 'ready' | 'error';
  error: string;
}
interface GameOverInfo {
  result: string;
  reason: string;
  overlayOpen: boolean;
}
interface SaveInfo {
  state: SaveState;
  error: string;
}
interface ViewInfo {
  orientation: 'w' | 'b';
  userColor: 'w' | 'b';
}
interface Settings {
  eloKey: string;
  color: 'w' | 'b' | 'random';
  timeSec: number;
}
interface Clocks {
  player: number;
  engine: number;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const TIME_CONTROLS = [
  { label: '1 MIN', sec: 60 },
  { label: '3 MIN', sec: 180 },
  { label: '5 MIN', sec: 300 },
  { label: '10 MIN', sec: 600 },
];

const HYPE: Record<string, string> = {
  novice: 'THE ROASTIE',
  casual: 'AMATEUR HOUR',
  club: 'CLUB BRAWLER',
  expert: 'THE EXPERT',
  master: 'THE MASTER',
  gm: 'THE GRANDMASTER',
  stockfish: 'STOCKFISH 2800',
};

const YOU_TURN = [
  'YOUR MOVE, HOTSHOT.',
  'SHOW THE MACHINE WHAT YOU\u2019RE MADE OF.',
  'DON\u2019T OVERTHINK IT — OVERTAKE IT.',
  'THE BOARD IS YOURS. SPEAK.',
  'EVERY SQUARE IS A STATEMENT. MAKE IT.',
];
const THINKING = [
  'ENGINE IS FUMING…',
  'CALCULATING YOUR DEMISE…',
  'SMOKE FROM THE PISTONS…',
  'DIGGING FOR YOUR WEAKNESS…',
  'RUNNING THE NUMBERS. LOOKING FOR BLOOD…',
];
const WON = ['YOU SMOKED THE MACHINE.', 'CHAOS SERVED. DELICIOUS.', 'THE FIRE IS YOURS. KEEP IT LIT.', 'THE MACHINE LEARNED FEAR TODAY.'];
const LOST = ['THE MACHINE PREVAILS. THIS TIME.', 'SMOKED BY YOUR OWN ENGINE.', 'BRUTAL. UNFORGIVING. UNFAIR.', 'IT NEVER BLINKS. NOW YOU KNOW.'];
const DRAW = ['A TRUCE IN THE CHAOS.', 'TOO MUCH FIRE. NOBODY WINS.', 'EVEN CHAOS WANTS A BREAK.'];

const PICK = (pool: string[], i: number) => pool[Math.abs(i) % pool.length];

const EMBERS = Array.from({ length: 12 }, (_, i) => ({
  left: (i * 8.3 + 4) % 96,
  size: 3 + (i % 3) * 2,
  delay: (i % 7) * 0.9,
  dur: 5 + (i % 5) * 1.7,
}));

const queryClient = new QueryClient();

interface ResolvedMove {
  from: string;
  to: string;
  promotion?: PieceKind;
}

function resolveMove(game: Chess, candidate: string): ResolvedMove | null {
  const verbose = game.moves({ verbose: true });
  const exact = verbose.find((m) => `${m.from}${m.to}${m.promotion ?? ''}` === candidate);
  if (exact) return { from: exact.from, to: exact.to, promotion: exact.promotion };
  if (candidate.length >= 4) {
    const from = candidate.slice(0, 2);
    const to = candidate.slice(2, 4);
    if (verbose.some((m) => m.from === from && m.to === to)) {
      return { from, to, promotion: candidate.length > 4 ? (candidate[4] as PieceKind) : undefined };
    }
  }
  return null;
}

export default function SpfxChess(props: ISpfxChessProps): JSX.Element {
  // ---- non-reactive game-loop refs ----
  let client: EngineClient | null = null;
  let game: Chess | null = null;
  let api: Api | null = null;
  let gameId = 0;
  let disposed = false;
  let thinkTimer: number | null = null;
  let clockTimer: number | null = null;
  let gameStartedAt: number | null = null;
  let initialFen = START_FEN;
  let lastEvalCp: number | null = null;
  let clockSnapshots: Clocks[] = [];
  let pendingSaveResult: string | null = null;
  let saveQueue: Promise<void> = Promise.resolve();

  // ---- reactive state (consolidated) ----
  const [store, setStore] = createSignal<GameStore | null>(null);
  const [engine, setEngine] = createSignal<EngineStatus>({ state: 'loading', error: '' });
  const [status, setStatus] = createSignal<Status>('setup');
  const [settings, setSettings] = createSignal<Settings>({
    eloKey: props.eloKey || 'club',
    color: props.playerColor || 'random',
    timeSec: 300,
  });
  const [view, setView] = createSignal<ViewInfo>({ orientation: 'w', userColor: 'w' });
  const [clocks, setClocks] = createSignal<Clocks>({ player: 0, engine: 0 });
  const [moveList, setMoveList] = createSignal<SavedMove[]>([]);
  const [fens, setFens] = createSignal<string[]>([]);
  const [cursor, setCursor] = createSignal(-1);
  const [thinkingInfo, setThinkingInfo] = createSignal<{ elapsedMs: number } | null>(null);
  const [gameOver, setGameOver] = createSignal<GameOverInfo | null>(null);
  const [promo, setPromo] = createSignal<{ from: Key; to: Key; color: PieceColor } | null>(null);
  const [save, setSave] = createSignal<SaveInfo>({ state: 'idle', error: '' });

  const updateEngine = (patch: Partial<EngineStatus>) => setEngine((prev) => ({ ...prev, ...patch }));
  const updateView = (patch: Partial<ViewInfo>) => setView((prev) => ({ ...prev, ...patch }));
  const updateClocks = (patch: Partial<Clocks>) => setClocks((prev) => ({ ...prev, ...patch }));
  const updateSave = (patch: Partial<SaveInfo>) => setSave((prev) => ({ ...prev, ...patch }));
  const updateSettings = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }));

  // Property-pane changes remount the web part (SolidWebPart.renderInto disposes and
  // re-renders), so settings pick up new props at mount. No sync effect here: with plain
  // object props, an effect reading props would only see mount-time values and revert
  // in-UI ELO/color selections the moment they are made.

  const playerName = () => props.playerName || 'Player';
  const autosave = () => props.autosave !== false;

  const cfg = () => eloConfig(settings().eloKey);
  const engineElo = () => cfg().elo;
  const hypeName = () => HYPE[settings().eloKey] ?? cfg().label;

  const storeMode = (): StoreMode => {
    const s = store();
    return s === null ? 'demo' : s.mode;
  };

  // ---- derived navigation state ----
  const liveIndex = () => moveList().length - 1;
  const atLive = () => cursor() >= liveIndex();
  const reviewing = () => cursor() < liveIndex();

  const moveBy = (i: number): 'you' | 'engine' => ((i % 2 === 0) === (view().userColor === 'w') ? 'you' : 'engine');

  // ---- timers ----
  const clearThinkTimer = () => {
    if (thinkTimer !== null) {
      window.clearInterval(thinkTimer);
      thinkTimer = null;
    }
  };
  const clearClockTimer = () => {
    if (clockTimer !== null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };

  function startClockTicker() {
    clearClockTimer();
    clockTimer = window.setInterval(() => {
      if (status() === 'your-turn') {
        const next = Math.max(0, clocks().player - 250);
        updateClocks({ player: next });
        if (next <= 0) {
          clearClockTimer();
          finishGame(view().userColor);
        }
      } else if (status() === 'thinking') {
        const next = Math.max(0, clocks().engine - 250);
        updateClocks({ engine: next });
        if (next <= 0) {
          clearClockTimer();
          finishGame(view().userColor === 'w' ? 'b' : 'w');
        }
      }
    }, 250);
  }

  // ---- engine lifecycle ----
  function onEngineError(message: string) {
    updateEngine({ state: 'error', error: message });
    clearThinkTimer();
    setThinkingInfo(null);
  }

  function retryEngine() {
    client?.dispose();
    client = null;
    updateEngine({ state: 'loading', error: '' });
    const c = new EngineClient();
    c.setOnError(onEngineError);
    c.start();
    client = c;
    endGame();
  }

  // ---- game flow ----
  function resetBoard() {
    gameId++;
    clearThinkTimer();
    clearClockTimer();
    setPromo(null);
    setThinkingInfo(null);
    setGameOver(null);
    setSave({ state: 'idle', error: '' });
    setMoveList([]);
    setFens([]);
    setCursor(-1);
    lastEvalCp = null;
    clockSnapshots = [];
    pendingSaveResult = null;
    gameStartedAt = null;
  }

  function endGame() {
    resetBoard();
    setStatus('setup');
  }

  function startGame() {
    resetBoard();
    game = new Chess();
    initialFen = game.fen();
    setStatus('your-turn');
    const choice = settings().color;
    const color: 'w' | 'b' = choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
    setView({ orientation: color, userColor: color });
    setClocks({ player: settings().timeSec * 1000, engine: settings().timeSec * 1000 });
    gameStartedAt = Date.now();
    startClockTicker();
    if (color === 'b') {
      setStatus('thinking');
      void engineMove();
    }
  }

  async function probeEngine() {
    const id = gameId;
    const currentFen = game?.fen() ?? START_FEN;
    try {
      await client?.search(currentFen, settings().eloKey);
    } catch {
      /* engine errors surface through onEngineError */
    }
    if (id !== gameId) return;
    if (engine().state !== 'error') updateEngine({ state: 'ready' });
  }

  async function engineMove() {
    if (!game || !client) return;
    const id = gameId;
    setStatus('thinking');
    const started = Date.now();
    clearThinkTimer();
    setThinkingInfo({ elapsedMs: 0 });
    thinkTimer = window.setInterval(() => {
      if (id !== gameId) {
        clearThinkTimer();
        return;
      }
      setThinkingInfo({ elapsedMs: Date.now() - started });
    }, 100);

    let res: SearchResult | null = null;
    try {
      res = await client.search(game.fen(), settings().eloKey);
    } catch {
      res = null;
    }
    if (id !== gameId) {
      clearThinkTimer();
      return;
    }
    clearThinkTimer();
    setThinkingInfo(null);
    if (engine().state !== 'error') updateEngine({ state: 'ready' });

    if (res) lastEvalCp = (game.turn() === 'w' ? 1 : -1) * res.score;

    let mv: ResolvedMove | null = null;
    if (res?.move) mv = resolveMove(game, res.move);
    if (!mv) {
      const legal = game.moves({ verbose: true });
      if (legal.length > 0) {
        mv = { from: legal[0].from, to: legal[0].to, promotion: legal[0].promotion };
      }
    }
    if (mv) {
      if (!commitMove(mv.from, mv.to, mv.promotion)) finishGame();
      return;
    }
    finishGame();
  }

  // ---- moves ----
  function onKeyEnter(key: Key) {
    if (status() !== 'your-turn' || promo() !== null || !atLive() || !game || !api) return;
    const selected = api.state.selected;
    if (selected && selected !== key) {
      handleMove(selected, key);
      return;
    }
    api.set({ selected: selected === key ? undefined : key });
  }

  function handleMove(orig: Key, dest: Key) {
    if (status() !== 'your-turn' || promo() !== null || !atLive() || !game) return;
    const piece = game.get(orig as Square);
    if (!piece || piece.color !== (view().userColor === 'w' ? 'w' : 'b')) return;
    if (piece.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
      setPromo({ from: orig, to: dest, color: piece.color });
      return;
    }
    commitMove(orig, dest, undefined);
  }

  function onPromoSelect(kind: PieceKind) {
    const p = promo();
    if (!p) return;
    setPromo(null);
    commitMove(p.from, p.to, kind);
  }

  function commitMove(from: string, to: string, promotion: PieceKind | undefined): boolean {
    if (!game || gameOver() !== null) return false;
    let mv;
    try {
      mv = game.move({ from, to, promotion });
    } catch {
      api?.set({ fen: game.fen() });
      return false;
    }

    clockSnapshots.push({ player: clocks().player, engine: clocks().engine });
    const nextFens = [...fens(), game.fen()];
    setFens(nextFens);
    setCursor(nextFens.length - 1);
    setMoveList((prev) => [...prev, { san: mv.san, uci: `${mv.from}${mv.to}${mv.promotion ?? ''}` }]);

    if (game.isGameOver()) {
      finishGame();
    } else if (game.turn() !== view().userColor) {
      setStatus('thinking');
      void engineMove();
    } else {
      setStatus('your-turn');
    }
    return true;
  }

  function undoLast() {
    if (status() !== 'your-turn' || !atLive() || !game || promo() !== null) return;
    if (game.history({ verbose: true }).length < 2) return;
    game.undo();
    game.undo();
    clockSnapshots.pop();
    const snap = clockSnapshots.pop();
    if (snap) setClocks(snap);
    const nextFens = fens().slice(0, -2);
    setFens(nextFens);
    setCursor(nextFens.length - 1);
    setMoveList((prev) => prev.slice(0, -2));
    lastEvalCp = null;
    setStatus('your-turn');
  }

  function resign() {
    if ((status() !== 'your-turn' && status() !== 'thinking') || !atLive()) return;
    finishGame(view().userColor, `${view().userColor === 'w' ? 'White' : 'Black'} resigns`);
  }

  function finishGame(loserColor?: 'w' | 'b', reasonOverride?: string) {
    clearClockTimer();
    if (!game) return;
    gameId++;
    let result: string;
    let reason: string;
    if (loserColor) {
      result = loserColor === 'w' ? '0-1' : '1-0';
      reason = reasonOverride ?? `${loserColor === 'w' ? 'White' : 'Black'} ran out of time`;
    } else if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      result = game.turn() === 'w' ? '0-1' : '1-0';
      reason = `Checkmate — ${winner} wins`;
    } else if (game.isStalemate()) {
      result = '1/2-1/2';
      reason = 'Stalemate';
    } else if (game.isInsufficientMaterial()) {
      result = '1/2-1/2';
      reason = 'Insufficient material';
    } else if (game.isThreefoldRepetition()) {
      result = '1/2-1/2';
      reason = 'Threefold repetition';
    } else if (game.isDrawByFiftyMoves()) {
      result = '1/2-1/2';
      reason = '50-move rule';
    } else {
      result = '1/2-1/2';
      reason = 'Draw';
    }
    setGameOver({ result, reason, overlayOpen: true });
    setStatus('game-over');
    if (autosave()) void saveCurrentGame(result);
  }

  // ---- saving ----
  function saveCurrentGame(result: string) {
    if (!game) return;
    pendingSaveResult = result;
    updateSave({ state: 'saving', error: '' });
    const s = store();
    if (!s) return; // initStore flushes the pending save once the vault is ready

    const c = cfg();
    const engineName = `Play Fish (${c.label})`;
    const isWhite = view().userColor === 'w';
    const whiteName = isWhite ? playerName() : engineName;
    const blackName = isWhite ? engineName : playerName();
    const whiteElo = isWhite ? 0 : c.elo;
    const blackElo = isWhite ? c.elo : 0;
    const site = s.getSiteUrl();

    game.header('White', whiteName);
    game.header('Black', blackName);
    game.header('WhiteElo', String(whiteElo));
    game.header('BlackElo', String(blackElo));
    game.header('Site', site);
    game.header('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    game.header('Result', result);
    const pgn = game.pgn();
    const durationMs = gameStartedAt ? Date.now() - gameStartedAt : 0;
    const mode = s.mode;

    // Snapshot the payload synchronously so a later game reset can't corrupt it.
    const payload = {
      title: `${whiteName} vs ${blackName}`,
      pgn,
      moves: moveList(),
      result,
      whiteElo,
      blackElo,
      whiteName,
      blackName,
      site,
      durationMs,
      eval: lastEvalCp ?? 0,
    };

    saveQueue = saveQueue.then(async () => {
      try {
        await s.saveGame(payload);
        if (pendingSaveResult !== result) return;
        updateSave({ state: mode === 'demo' ? 'demo' : 'saved', error: '' });
        void queryClient.invalidateQueries({ queryKey: ['chess-games', props.listName] });
      } catch (err) {
        if (pendingSaveResult !== result) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[chess] save failed:', err);
        updateSave({ state: 'error', error: msg });
      } finally {
        if (pendingSaveResult === result) pendingSaveResult = null;
      }
    });
  }

  // ---- saved games ----
  function loadGame(saved: SavedGame) {
    resetBoard();
    setSave({ state: 'idle', error: '' });

    let g: Chess | null = null;
    const moves: SavedMove[] = [];
    const history: string[] = [];

    try {
      const loaded = new Chess();
      loaded.loadPgn(saved.pgn);
      g = loaded;
    } catch {
      /* fall back to move-by-move replay below */
    }

    if (g) {
      const replay = new Chess();
      initialFen = replay.fen();
      for (const hm of g.history({ verbose: true })) {
        try {
          replay.move({ from: hm.from, to: hm.to, promotion: hm.promotion });
          moves.push({ san: hm.san, uci: `${hm.from}${hm.to}${hm.promotion ?? ''}` });
          history.push(replay.fen());
        } catch {
          break;
        }
      }
    } else {
      try {
        const replay = new Chess();
        initialFen = replay.fen();
        for (const mv of saved.moves) {
          try {
            replay.move(mv.san);
            moves.push(mv);
            history.push(replay.fen());
          } catch {
            break;
          }
        }
        g = replay;
      } catch {
        g = null;
      }
    }
    if (!g) return;

    game = g;
    setMoveList(moves);
    setFens(history);
    setCursor(history.length - 1);
    setGameOver({ result: saved.result || '1/2-1/2', reason: 'Saved game', overlayOpen: false });
    const userColor: 'w' | 'b' = saved.blackName === playerName() ? 'b' : 'w';
    setView({ orientation: userColor, userColor });
    setStatus('viewing');
  }

  async function deleteGame(id: number | string) {
    const s = store();
    if (!s) return;
    try {
      await s.deleteGame(id);
      void queryClient.invalidateQueries({ queryKey: ['chess-games', props.listName] });
    } catch (err) {
      console.warn('[chess] failed to delete game:', err);
    }
  }

  // ---- board config ----
  const shown = createMemo(() => {
    const cur = cursor();
    const reviewingNow = cur < liveIndex();
    const lm = cur >= 0 ? moveList()[cur] : null;
    const fen = cur >= 0 ? (fens()[cur] ?? initialFen) : initialFen;
    return {
      fen,
      check: reviewingNow ? new Chess(fen).inCheck() : (game?.inCheck() ?? false),
      turn: reviewingNow ? new Chess(fen).turn() : (game?.turn() ?? 'w'),
      lastMove: lm ? ([lm.uci.slice(0, 2), lm.uci.slice(2, 4)] as [Key, Key]) : undefined,
    };
  });

  const fen = () => shown().fen;

  const dests = createMemo(() => {
    const f = fen();
    if (status() !== 'your-turn' || !atLive() || !game) return undefined;
    const map = new Map<string, string[]>();
    for (const mv of game.moves({ verbose: true })) {
      const arr = map.get(mv.from) ?? [];
      arr.push(mv.to);
      map.set(mv.from, arr);
    }
    return map;
  });

  const engineArrow = createMemo((): Array<{ orig: Key; dest: Key; brush: string }> => {
    const cur = cursor();
    if (cur < 0) return [];
    const mv = moveList()[cur];
    if (!mv || moveBy(cur) !== 'engine') return [];
    return [{ orig: mv.uci.slice(0, 2) as Key, dest: mv.uci.slice(2, 4) as Key, brush: 'engine-move' }];
  });

  const boardConfig = (): Config => {
    const interactive = status() === 'your-turn' && promo() === null && atLive();
    const reviewingNow = reviewing();
    return {
      fen: shown().fen,
      orientation: view().orientation === 'w' ? 'white' : 'black',
      turnColor: shown().turn === 'w' ? 'white' : 'black',
      check: shown().check,
      lastMove: shown().lastMove,
      coordinates: true,
      viewOnly: status() === 'viewing' || reviewingNow,
      animation: { enabled: true, duration: 250 },
      highlight: { lastMove: true, check: true },
      movable: {
        free: false,
        color: interactive ? (view().userColor === 'w' ? 'white' : 'black') : undefined,
        dests: interactive ? (dests() as Map<Key, Key[]>) : undefined,
        showDests: true,
        events: { after: (orig, dest) => handleMove(orig, dest) },
      },
      draggable: { enabled: interactive, showGhost: true },
      selectable: { enabled: interactive },
      drawable: {
        enabled: true,
        autoShapes: engineArrow(),
        brushes: {
          green: { key: 'green', color: '#2f6fed', opacity: 0.6, lineWidth: 8 },
          red: { key: 'red', color: '#ff2d55', opacity: 0.6, lineWidth: 8 },
          blue: { key: 'blue', color: '#ff4a11', opacity: 0.6, lineWidth: 8 },
          yellow: { key: 'yellow', color: '#ffb02e', opacity: 0.6, lineWidth: 8 },
          'engine-move': { key: 'engine-move', color: '#ff4a11', opacity: 0.85, lineWidth: 8 },
        },
      },
    };
  };

  const userWon = createMemo(() => {
    const go = gameOver();
    if (!go) return false;
    return (go.result === '1-0' && view().userColor === 'w') || (go.result === '0-1' && view().userColor === 'b');
  });

  const overlayGame = () => {
    const go = gameOver();
    return go && go.overlayOpen ? go : null;
  };

  const announcer = createMemo(() => {
    const st = status();
    const n = moveList().length;
    const mix = n + (view().userColor === 'b' ? 3 : 0);
    if (reviewing()) {
      return st === 'viewing'
        ? `REPLAYING MOVE ${cursor() + 1} OF ${liveIndex() + 1}…`
        : 'WINDOW SHOPPING? COME BACK AND MOVE.';
    }
    switch (st) {
      case 'setup':
        return 'READY FOR CHAOS.';
      case 'your-turn':
        return `${game?.inCheck() ? 'CHECK! ' : ''}${PICK(YOU_TURN, mix)}`;
      case 'thinking': {
        const t = thinkingInfo();
        return `${PICK(THINKING, mix + 1)}${t ? ` ${(t.elapsedMs / 1000).toFixed(1)}s` : ''}`;
      }
      case 'game-over':
        if (userWon()) return PICK(WON, n);
        if (gameOver()?.result === '1/2-1/2') return PICK(DRAW, n);
        return PICK(LOST, n);
      case 'viewing':
        return 'REPLAYING THE CARNAGE…';
      default:
        return '';
    }
  });

  const announcerClass = () => {
    const base =
      'animate-slam-in mb-3 rounded-lg border px-4 py-3 text-center font-display text-sm font-bold uppercase tracking-wider';
    if (reviewing()) return `${base} border-flame/50 bg-flame/15 text-amber-800`;
    switch (status()) {
      case 'your-turn':
        return `${base} border-ember/40 bg-ember/10 text-ember`;
      case 'thinking':
        return `${base} border-flame/50 bg-flame/15 text-amber-800`;
      case 'game-over':
        return userWon()
          ? `${base} border-lime-600/40 bg-lime-600/10 text-lime-700`
          : gameOver()?.result === '1/2-1/2'
            ? `${base} border-line bg-surface-alt text-ink-muted`
            : `${base} border-red-500/40 bg-red-500/10 text-red-600`;
      default:
        return `${base} border-line bg-surface-alt text-ink-muted`;
    }
  };

  const liveText = () => {
    const go = gameOver();
    return go && status() === 'game-over' ? `${announcer()} — ${go.reason}` : announcer();
  };

  const fmtClock = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const evalLabel = () => {
    if (lastEvalCp === null) return '';
    const cp = lastEvalCp;
    if (Math.abs(cp) >= 90000) return cp > 0 ? `M${100000 - cp}` : `-M${100000 + cp}`;
    return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
  };
  const evalPct = () => (lastEvalCp === null ? 50 : Math.max(0, Math.min(100, 50 + lastEvalCp / 12)));

  const canUndo = () => status() === 'your-turn' && atLive() && moveList().length >= 2;

  // Re-slam the announcer whenever the status or review mode changes.
  let annRef: HTMLParagraphElement | undefined;
  createEffect(() => {
    const el = annRef;
    void status();
    void reviewing();
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  });

  // ---- mount / cleanup ----
  onMount(() => {
    const c = new EngineClient();
    c.setOnError(onEngineError);
    c.start();
    client = c;
    void initStore();
    void probeEngine();
  });

  async function initStore() {
    try {
      const gs = await GameStore.create(props.context, props.listName);
      if (disposed) return;
      setStore(gs);
      void queryClient.invalidateQueries({ queryKey: ['chess-games', props.listName] });
      if (pendingSaveResult) {
        const r = pendingSaveResult;
        pendingSaveResult = null;
        void saveCurrentGame(r);
      }
    } catch (err) {
      console.warn('[chess] store init failed:', err);
    }
  }

  onCleanup(() => {
    disposed = true;
    clearThinkTimer();
    clearClockTimer();
    client?.dispose();
    client = null;
  });

  // ---- render ----
  return (
    <QueryClientProvider client={queryClient}>
      <div class="w-full">
        <header class="relative z-0 mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 overflow-hidden rounded-xl border border-line bg-surface-alt px-4 py-3 shadow-md">
          <div class="relative z-10 flex items-center gap-2.5">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sienna to-ash text-flame shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_6px_rgba(255,74,17,0.35)]"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" class="h-5 w-5">
                <path d="M14.5 2c1.2.3 1.7 1.2 1.6 2.2-.1.7-.4 1.2-1 1.6l-.3.2c.6.2 1 .6 1.2 1.1.1.6-.1 1.2-.7 1.6l-.4.2c.8.3 1.2.9 1.2 1.7 0 .5-.2 1-.6 1.4.7.3 1.2.8 1.4 1.4.2.8-.2 1.5-.9 1.9l-.2.1c.2.6.1 1.2-.3 1.7-.4.5-1 .8-1.7.8h-6.2c-.7 0-1.3-.3-1.7-.8-.4-.5-.5-1.1-.3-1.7l.2-.1c-.7-.4-1.1-1.1-.9-1.9.2-.6.7-1.1 1.4-1.4-.4-.4-.6-.9-.6-1.4 0-.8.4-1.4 1.2-1.7l-.4-.2c-.6-.4-.8-1-.7-1.6.2-.5.6-.9 1.2-1.1l-.3-.2c-.6-.4-.9-.9-1-1.6-.1-1 .4-1.9 1.6-2.2L11.5 2c.7-.3 1.6-.3 2.3 0l.7.2zM8.2 18.5c.3 1.5.8 2.9 1.4 4h4.8c.6-1.1 1.1-2.5 1.4-4H8.2z" />
              </svg>
            </span>
            <h1 class="font-display text-lg font-bold uppercase tracking-[0.18em] text-ink sm:text-xl">
              PLAY <span class="text-ember drop-shadow-[0_0_10px_rgba(255,74,17,0.5)]">FISH</span>
            </h1>
          </div>
          <div class="relative z-10 flex flex-wrap items-center gap-1.5">
            <span class="inline-flex items-center gap-1 rounded-full border border-ember/40 bg-ember/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember">
              VS {hypeName()} · {engineElo()} ELO
            </span>
            <Show when={storeMode() === 'demo' && status() !== 'setup'}>
              <span class="inline-flex items-center gap-1 rounded-full border border-flame/50 bg-flame/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                LOCAL MODE
              </span>
            </Show>
            <Show when={save().state === 'saving'}>
              <span class="inline-flex items-center gap-1 rounded-full border border-flame/50 bg-flame/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                ARCHIVING…
              </span>
            </Show>
            <Show when={save().state === 'saved'}>
              <span class="inline-flex items-center gap-1 rounded-full border border-lime-600/40 bg-lime-600/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime-700">
                IN THE VAULT
              </span>
            </Show>
            <Show when={save().state === 'error'}>
              <span class="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                VAULT ERROR
              </span>
            </Show>
          </div>
          <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <For each={EMBERS}>
              {(e) => (
                <span
                  class="animate-ember-rise absolute -bottom-1 rounded-full bg-ember shadow-[0_0_6px_rgba(255,74,17,0.8)]"
                  style={{
                    left: `${e.left}%`,
                    width: `${e.size}px`,
                    height: `${e.size}px`,
                    'animation-delay': `${e.delay}s`,
                    'animation-duration': `${e.dur}s`,
                  }}
                />
              )}
            </For>
          </div>
        </header>

        <div class="sr-only" role="status" aria-live="polite">
          {liveText()}
        </div>

        <main class="grid gap-4 ">
          <section class="min-w-0">
            <Show
              when={status() === 'setup'}
              fallback={
                <>
                  <p ref={annRef} class={announcerClass()}>
                    {announcer()}
                  </p>

                  <Show when={status() !== 'viewing'}>
                    <div class="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div
                        classList={{
                          'flex items-center justify-between gap-2 rounded-lg border bg-surface-alt px-3 py-2 transition-all': true,
                          'border-accent shadow-[0_0_14px_var(--color-accent-soft)]': status() === 'your-turn',
                          'border-line': status() !== 'your-turn',
                        }}
                      >
                        <span class="text-[10px] font-bold uppercase tracking-widest text-ink-muted">YOU</span>
                        <span
                          classList={{
                            'font-mono text-lg font-bold tabular-nums text-ink': true,
                            'animate-clock-pulse text-red-500': clocks().player > 0 && clocks().player < 30000,
                          }}
                        >
                          {fmtClock(clocks().player)}
                        </span>
                      </div>
                      <div class="text-xs font-black tracking-widest text-ink-muted">VS</div>
                      <div
                        classList={{
                          'flex items-center justify-between gap-2 rounded-lg border bg-surface-alt px-3 py-2 transition-all': true,
                          'border-accent shadow-[0_0_14px_var(--color-accent-soft)]': status() === 'thinking',
                          'border-line': status() !== 'thinking',
                        }}
                      >
                        <span class="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{hypeName()}</span>
                        <span
                          classList={{
                            'font-mono text-lg font-bold tabular-nums text-ink': true,
                            'animate-clock-pulse text-red-500': clocks().engine > 0 && clocks().engine < 30000,
                          }}
                        >
                          {fmtClock(clocks().engine)}
                        </span>
                      </div>
                    </div>
                  </Show>

                  <Show when={(status() === 'your-turn' || status() === 'thinking') && atLive()}>
                    <div class="mb-3 flex items-center gap-2" aria-hidden="true">
                      <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-sienna/25">
                        <div
                          class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ember via-flame to-lime"
                          style={{ width: `${evalPct()}%` }}
                        />
                      </div>
                      <span class="w-12 text-right font-mono text-[11px] font-bold tabular-nums text-ink-muted">
                        {evalLabel()}
                      </span>
                    </div>
                  </Show>

                  <div class="rounded-xl border-2 border-sienna/40 bg-sienna/10 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
                    <div class="relative w-full overflow-hidden">
                      <ChessBoard
                        getConfig={boardConfig}
                        onApi={(a) => {
                          api = a;
                        }}
                        onKeyEnter={onKeyEnter}
                      />

                      <Show when={engine().state === 'loading' && status() === 'thinking'}>
                        <div class="absolute inset-0 z-20 flex items-center justify-center bg-ash/75 p-4 backdrop-blur-sm" role="status" aria-live="polite">
                          <div class="flex flex-col items-center gap-3 px-6 text-center">
                            <span class="h-8 w-8 animate-spin rounded-full border-[3px] border-ember/25 border-t-ember" aria-hidden="true" />
                            <p class="animate-glow-pulse font-display text-sm font-black uppercase tracking-widest text-flame">
                              IGNITING THE ENGINE…
                            </p>
                            <div
                              class="relative h-1 w-40 overflow-hidden rounded-full bg-sienna/40 after:absolute after:inset-y-0 after:left-[-100%] after:w-full after:animate-ignite-scan after:bg-gradient-to-r after:from-transparent after:via-flame after:to-transparent"
                              aria-hidden="true"
                            />
                            <p class="text-xs text-ink-muted">
                              Hauling the engine into the browser — the first move takes a moment.
                            </p>
                          </div>
                        </div>
                      </Show>

                      <Show when={engine().state === 'error'}>
                        <div class="absolute inset-0 z-20 flex items-center justify-center bg-ash/75 p-4 backdrop-blur-sm" role="alert">
                          <div class="animate-fade-slide-in flex max-w-xs flex-col items-center gap-2 rounded-xl border border-line bg-surface-alt px-6 py-5 text-center shadow-2xl">
                            <p class="font-display text-sm font-black uppercase tracking-widest text-red-500">ENGINE DIED</p>
                            <p class="break-words text-xs text-ink-muted">{engine().error}</p>
                            <div class="mt-2 flex gap-2">
                              <button
                                type="button"
                                class="inline-flex cursor-pointer items-center justify-center rounded-md border border-line bg-surface px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-ink-muted hover:bg-ink/5 active:scale-95"
                                onClick={() => updateEngine({ state: 'ready', error: '' })}
                              >
                                KEEP PLAYING
                              </button>
                              <button
                                type="button"
                                class="inline-flex cursor-pointer items-center justify-center rounded-md border border-ember bg-ember px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-ember/30 transition-colors hover:bg-[#e63c05] active:scale-95"
                                onClick={retryEngine}
                              >
                                RESTART
                              </button>
                            </div>
                          </div>
                        </div>
                      </Show>

                      <Show when={promo()} fallback={null}>
                        {(p) => (
                          <PromotionPicker
                            color={p().color}
                            onSelect={onPromoSelect}
                            onCancel={() => setPromo(null)}
                          />
                        )}
                      </Show>

                      <Show when={overlayGame()} fallback={null}>
                        {(go) => (
                          <GameOverOverlay
                            result={go().result}
                            reason={go().reason}
                            userWon={userWon()}
                            saveState={save().state}
                            saveError={save().error}
                            onNewGame={endGame}
                            onHome={endGame}
                            onViewMoves={() => setGameOver((prev) => (prev ? { ...prev, overlayOpen: false } : prev))}
                            onRetrySave={() => void saveCurrentGame(go().result)}
                          />
                        )}
                      </Show>
                    </div>
                  </div>

                  <Show when={reviewing()}>
                    <div class="mt-3 flex items-center gap-1.5 rounded-lg border border-line bg-surface-alt p-1.5" role="toolbar" aria-label="Review moves">
                      <button
                        type="button"
                        class="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-1 text-sm font-bold text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        onClick={() => setCursor(-1)}
                        disabled={cursor() <= -1}
                        aria-label="Go to start"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        class="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-1 text-sm font-bold text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        onClick={() => setCursor((c) => Math.max(-1, c - 1))}
                        disabled={cursor() <= -1}
                        aria-label="Previous move"
                      >
                        ‹
                      </button>
                      <span class="mx-1 font-mono text-[10px] font-bold tracking-wider text-ink-muted">
                        MOVE {cursor() + 1} OF {liveIndex() + 1}
                      </span>
                      <button
                        type="button"
                        class="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-1 text-sm font-bold text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        onClick={() => setCursor((c) => Math.min(liveIndex(), c + 1))}
                        disabled={atLive()}
                        aria-label="Next move"
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        class="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-1 text-sm font-bold text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        onClick={() => setCursor(liveIndex())}
                        disabled={atLive()}
                        aria-label="Go to end"
                      >
                        »
                      </button>
                      <button
                        type="button"
                        class="ml-auto flex h-7 cursor-pointer items-center justify-center rounded-md border border-flame/50 bg-flame/15 px-2 text-[10px] font-bold uppercase tracking-wider text-amber-800 transition-colors hover:bg-flame/25"
                        onClick={() => setCursor(liveIndex())}
                      >
                        BACK TO LIVE
                      </button>
                    </div>
                  </Show>

                  <Show when={status() === 'your-turn' || status() === 'thinking'}>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-surface-alt px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-ink-muted hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => updateView({ orientation: view().orientation === 'w' ? 'b' : 'w' })}
                      >
                        ↔ FLIP
                      </button>
                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-surface-alt px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-ink-muted hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!canUndo()}
                        onClick={undoLast}
                      >
                        ↶ TAKE IT BACK
                      </button>
                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-600 transition-colors hover:border-red-500/60 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={resign}
                      >
                        ⚑ RESIGN
                      </button>
                    </div>
                  </Show>

                  <Show when={status() === 'viewing'}>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-accent/30 transition-colors hover:bg-accent-strong active:scale-95"
                        onClick={endGame}
                      >
                        BACK TO PLAY
                      </button>
                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-surface-alt px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-ink-muted hover:bg-ink/5"
                        onClick={endGame}
                      >
                        🏠 HOME
                      </button>
                    </div>
                  </Show>

                  <Show when={status() === 'game-over'}>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-surface-alt px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-ink-muted hover:bg-ink/5"
                        onClick={endGame}
                      >
                        🏠 HOME
                      </button>
                    </div>
                  </Show>
                </>
              }
            >
              <div class="animate-fade-slide-in mx-auto max-w-xl rounded-2xl border border-line bg-surface-alt p-5 shadow-[0_16px_40px_rgba(0,0,0,0.25)] sm:p-7">
                <div class="mb-6 text-center">
                  <h2 class="font-display text-2xl font-black uppercase tracking-widest text-ink sm:text-3xl">
                    SET THE <em class="text-ember drop-shadow-[0_0_12px_rgba(255,74,17,0.4)]">STAKES</em>
                  </h2>
                  <p class="mt-2 text-xs leading-relaxed text-ink-muted sm:text-sm">
                    Pick an thishello again , your color, and how long the fire burns. The engine never blinks — beat it anyway.
                  </p>
                </div>

                <div class="mb-5">
                  <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">OPPONENT</span>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <For each={ELO_LEVELS}>
                      {(l) => {
                        return (
                          <button
                            type="button"
                            classList={{
                              'flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-all hover:-translate-y-0.5 hover:shadow-sm': true,
                              'border-accent bg-accent-soft shadow-[0_0_0_1px_var(--color-accent),0_4px_14px_var(--color-accent-soft)]': settings().eloKey === l.key,
                              'border-line bg-surface': settings().eloKey !== l.key,
                            }}
                            onClick={() => updateSettings({ eloKey: l.key })}
                          >
                            <span class="font-display text-[11px] font-black uppercase tracking-wider text-ink" classList={{ 'text-accent-strong': settings().eloKey === l.key }}>
                              {HYPE[l.key] ?? l.label}
                            </span>
                            <span class="font-mono text-base font-black text-ink" classList={{ 'text-accent-strong': settings().eloKey === l.key }}>
                              {l.elo}
                            </span>
                            <span class="text-[9px] font-semibold uppercase tracking-wider text-ink-muted">{l.label}</span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>

                <div class="mb-5">
                  <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">PLAY AS</span>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      classList={{
                        'cursor-pointer rounded-md border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors': true,
                        'border-accent bg-accent-soft text-accent': settings().color === 'w',
                        'border-line bg-surface text-ink-muted hover:border-ink-muted hover:text-ink': settings().color !== 'w',
                      }}
                      onClick={() => updateSettings({ color: 'w' })}
                    >
                      ♔ WHITE
                    </button>
                    <button
                      type="button"
                      classList={{
                        'cursor-pointer rounded-md border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors': true,
                        'border-accent bg-accent-soft text-accent': settings().color === 'b',
                        'border-line bg-surface text-ink-muted hover:border-ink-muted hover:text-ink': settings().color !== 'b',
                      }}
                      onClick={() => updateSettings({ color: 'b' })}
                    >
                      ♚ BLACK
                    </button>
                    <button
                      type="button"
                      classList={{
                        'cursor-pointer rounded-md border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors': true,
                        'border-accent bg-accent-soft text-accent': settings().color === 'random',
                        'border-line bg-surface text-ink-muted hover:border-ink-muted hover:text-ink': settings().color !== 'random',
                      }}
                      onClick={() => updateSettings({ color: 'random' })}
                    >
                      🎲 RANDOM
                    </button>
                  </div>
                </div>

                <div class="mb-5">
                  <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">CLOCK</span>
                  <div class="flex flex-wrap gap-2">
                    <For each={TIME_CONTROLS}>
                      {(tc) => (
                        <button
                          type="button"
                          classList={{
                            'cursor-pointer rounded-md border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors': true,
                            'border-accent bg-accent-soft text-accent': settings().timeSec === tc.sec,
                            'border-line bg-surface text-ink-muted hover:border-ink-muted hover:text-ink': settings().timeSec !== tc.sec,
                          }}
                          onClick={() => updateSettings({ timeSec: tc.sec })}
                        >
                          {tc.label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <button
                  type="button"
                  class="mt-6 w-full cursor-pointer rounded-xl border-2 border-ember bg-gradient-to-r from-ember to-[#ff6a1f] px-6 py-3.5 font-display text-base font-black uppercase tracking-[0.15em] text-white shadow-[0_6px_20px_rgba(255,74,17,0.4)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(255,74,17,0.5)] active:translate-y-0 active:scale-[0.99]"
                  onClick={startGame}
                >
                  LIGHT THE MATCH
                </button>

                <Show when={storeMode() === 'demo'}>
                  <p class="mt-3 text-center text-[11px] font-medium text-ink-muted">
                    LOCAL MODE — finished games are saved in this browser only.
                  </p>
                </Show>
              </div>
            </Show>
          </section>

          <aside class="flex min-w-0 flex-col gap-3">
            <MoveHistory
              moves={moveList()}
              currentIndex={cursor()}
              onSelectMove={(i) => setCursor(i)}
              getPgn={() => game?.pgn() ?? ''}
            />
            <GamesPanel
              store={store()}
              mode={storeMode()}
              listName={props.listName}
              onLoad={loadGame}
              onDelete={deleteGame}
            />
            <div class="rounded-lg border border-dashed border-line bg-surface-alt/60 px-3 py-2.5 text-[11px] leading-relaxed text-ink-muted">
              <p>
                <strong class="font-bold text-ink">PLAY FISH</strong> — chess against Stockfish, a full engine that lives in your browser via WebAssembly.
                It never blinks. It holds grudges. Beat it.
              </p>
            </div>
          </aside>
        </main>
      </div>
    </QueryClientProvider>
  );
}
