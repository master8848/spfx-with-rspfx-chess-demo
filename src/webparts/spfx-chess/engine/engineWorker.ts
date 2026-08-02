import { Chess } from 'chess.js';
import { eloConfig, parsePvs, pickMove } from './elo';

export interface SearchRequest {
  id: number;
  type: 'search';
  fen: string;
  eloKey: string;
}

export type EngineResponse =
  | { id: number; type: 'bestmove'; move: string | null; depth: number; nodes: number; score: number }
  | { id?: number; type: 'error'; message: string };

const INIT_TIMEOUT_MS = 30_000;

let sf: Worker | null = null;
let engineReady = false;
let engineFailed = false;
let initTimer: ReturnType<typeof setTimeout> | null = null;

let pendingId: number | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let currentFen = '';
let currentEloKey = '';
let infoBuffer: string[] = [];
let trackedDepth = 0;
let trackedNodes = 0;
let trackedScore = 0;
let trackedMate = false;

function randomLegalMove(fen: string): string | null {
  const legal = new Chess(fen).moves({ verbose: false });
  return legal.length > 0 ? legal[Math.floor(Math.random() * legal.length)] : null;
}

function clearSearchTimer(): void {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

function failEngine(message: string): void {
  if (engineFailed) return;
  engineFailed = true;
  if (initTimer !== null) {
    clearTimeout(initTimer);
    initTimer = null;
  }
  clearSearchTimer();
  sf?.terminate();
  sf = null;
  engineReady = false;
  pendingId = null;
  self.postMessage({ type: 'error', message } satisfies EngineResponse);
}

function trackInfo(line: string): void {
  const depth = line.match(/\bdepth (\d+)/)?.[1];
  if (depth !== undefined) trackedDepth = Number(depth);
  const nodes = line.match(/\bnodes (\d+)/)?.[1];
  if (nodes !== undefined) trackedNodes = Number(nodes);
  const cp = line.match(/\bscore cp (-?\d+)/)?.[1];
  const mate = line.match(/\bscore mate (-?\d+)/)?.[1];
  if (mate !== undefined) {
    trackedMate = true;
    trackedScore = Number(mate) > 0 ? 100000 - Number(mate) : -100000 - Number(mate);
  } else if (cp !== undefined) {
    trackedMate = false;
    trackedScore = Number(cp);
  }
}

function onBestMoveLine(line: string): void {
  const id = pendingId;
  pendingId = null;
  clearSearchTimer();
  if (id === null) return;

  const best = line.match(/^bestmove (\S+)/)?.[1] ?? '(none)';
  const legal = new Chess(currentFen).moves({ verbose: false });

  let move: string | null = null;
  if (best !== '(none)') {
    const pvs = parsePvs(infoBuffer.join('\n'));
    pvs.unshift({ move: best, score: trackedScore, mate: trackedMate });
    const seen = new Set<string>();
    const unique = pvs.filter((p) => (seen.has(p.move) ? false : (seen.add(p.move), true)));
    const config = eloConfig(currentEloKey);
    move = pickMove(unique, config, legal);
    if (!move) move = legal[Math.floor(Math.random() * legal.length)] ?? null;
  } else {
    move = legal[Math.floor(Math.random() * legal.length)] ?? null;
  }

  self.postMessage({ id, type: 'bestmove', move, depth: trackedDepth, nodes: trackedNodes, score: trackedScore } satisfies EngineResponse);
}

function onEngineMessage(event: MessageEvent): void {
  const line = String(event.data ?? '').trim();
  if (line === 'uciok') {
    sf?.postMessage('isready');
    return;
  }
  if (line === 'readyok') {
    if (initTimer !== null) {
      clearTimeout(initTimer);
      initTimer = null;
    }
    engineReady = true;
    return;
  }
  if (pendingId === null) return;
  if (line.startsWith('info')) {
    infoBuffer.push(line);
    trackInfo(line);
    return;
  }
  if (line.startsWith('bestmove')) {
    onBestMoveLine(line);
  }
}

function startEngine(): void {
  try {
    const engineUrl = new URL('./stockfish-18-lite-single.js', self.location.href).href;
    const worker = new Worker(engineUrl, { type: 'classic' });
    sf = worker;
    worker.onmessage = onEngineMessage;
    worker.onerror = (e) => failEngine(`Engine worker error: ${e.message || 'failed to load'}`);
    worker.postMessage('uci');
  } catch (err) {
    failEngine(`Failed to start engine: ${String(err)}`);
    return;
  }
  initTimer = setTimeout(() => {
    if (!engineReady) failEngine(`Engine init timed out after ${INIT_TIMEOUT_MS / 1000}s`);
  }, INIT_TIMEOUT_MS);
}

startEngine();

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const msg = event.data;
  if (msg.type !== 'search') return;

  const legal = new Chess(msg.fen).moves({ verbose: false });
  if (legal.length === 0) {
    self.postMessage({ id: msg.id, type: 'bestmove', move: null, depth: 0, nodes: 0, score: 0 } satisfies EngineResponse);
    return;
  }

  if (!engineReady || !sf) {
    self.postMessage({ id: msg.id, type: 'bestmove', move: legal[Math.floor(Math.random() * legal.length)], depth: 0, nodes: 0, score: 0 } satisfies EngineResponse);
    return;
  }

  const config = eloConfig(msg.eloKey);

  if (config.blunder > 0 && Math.random() < config.blunder) {
    self.postMessage({ id: msg.id, type: 'bestmove', move: legal[Math.floor(Math.random() * legal.length)], depth: 0, nodes: 0, score: 0 } satisfies EngineResponse);
    return;
  }

  clearSearchTimer();
  pendingId = msg.id;
  currentFen = msg.fen;
  currentEloKey = msg.eloKey;
  infoBuffer = [];
  trackedDepth = 0;
  trackedNodes = 0;
  trackedScore = 0;
  trackedMate = false;

  try {
    sf.postMessage(`setoption name MultiPV value ${config.multiPv}`);
    sf.postMessage(`position fen ${msg.fen}`);
    sf.postMessage(`go movetime ${config.movetime}`);
  } catch (err) {
    pendingId = null;
    self.postMessage({ id: msg.id, type: 'bestmove', move: legal[Math.floor(Math.random() * legal.length)], depth: 0, nodes: 0, score: 0 } satisfies EngineResponse);
    return;
  }

  searchTimer = setTimeout(() => {
    if (pendingId === msg.id) {
      const id = pendingId;
      pendingId = null;
      self.postMessage({ id, type: 'bestmove', move: legal[Math.floor(Math.random() * legal.length)], depth: 0, nodes: 0, score: 0 } satisfies EngineResponse);
    }
    searchTimer = null;
  }, config.movetime + 10_000);
};

export {};
