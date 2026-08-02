import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import { createEffect, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

export interface ChessBoardProps {
  /** Re-read on every reactive change; applied via `api.set()`. */
  getConfig: () => Config;
  /** Called once after the board is created. */
  onApi?: (api: Api) => void;
  /** Keyboard Enter/Space on the cursor square. */
  onKeyEnter?: (key: Key) => void;
}

const FILES = 'abcdefgh';
const RANKS = '87654321';

export default function ChessBoard(props: ChessBoardProps): JSX.Element {
  let root: HTMLDivElement | undefined;
  const [api, setApi] = createSignal<Api | null>(null);
  const [cursor, setCursor] = createSignal<Key | null>(null);

  onMount(() => {
    if (!root) return;
    const a = Chessground(root, props.getConfig());
    setApi(a);
    props.onApi?.(a);
  });

  createEffect(() => {
    const a = api();
    if (a) a.set(props.getConfig());
  });

  function moveCursor(dx: number, dy: number): void {
    const black = props.getConfig().orientation === 'black';
    if (black) {
      dx = -dx;
      dy = -dy;
    }
    const cur = cursor() ?? (black ? 'e5' : 'e4');
    const f = FILES.indexOf(cur[0]) + dx;
    const r = RANKS.indexOf(cur[1]) + dy;
    if (f < 0 || f > 7 || r < 0 || r > 7) return;
    const key = `${FILES[f]}${RANKS[r]}` as Key;
    setCursor(key);
    api()?.set({ selected: key });
  }

  function onKeyDown(e: KeyboardEvent): void {
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const d = dirs[e.key];
    if (d) {
      e.preventDefault();
      moveCursor(d[0], d[1]);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && cursor()) {
      e.preventDefault();
      props.onKeyEnter?.(cursor() as Key);
    }
  }

  onCleanup(() => {
    api()?.destroy();
  });

  return (
    <div
      ref={root}
      class="aspect-square w-full"
      tabIndex={0}
      role="application"
      aria-label="Chess board. Arrow keys move the cursor, Enter or Space selects or moves."
      onKeyDown={onKeyDown}
    />
  );
}
