import { createEffect, createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import type { SavedMove } from '../services/gameStore';

export interface MoveHistoryProps {
  moves: SavedMove[];
  /** Index of the currently shown position (-1 = starting position). */
  currentIndex: number;
  onSelectMove: (index: number) => void;
  getPgn?: () => string;
}

export default function MoveHistory(props: MoveHistoryProps): JSX.Element {
  let listRef: HTMLDivElement | undefined;
  const [copied, setCopied] = createSignal(false);
  let copyTimer: number | null = null;

  const pairs = () => {
    const out: { num: number; white: string; black: string }[] = [];
    for (let i = 0; i < props.moves.length; i += 2) {
      out.push({
        num: i / 2 + 1,
        white: props.moves[i]?.san ?? '',
        black: props.moves[i + 1]?.san ?? '',
      });
    }
    return out;
  };

  const atEnd = () => props.currentIndex >= props.moves.length - 1;

  createEffect(() => {
    const el = listRef;
    const cur = props.currentIndex;
    if (!el || props.moves.length === 0) return;
    if (atEnd()) {
      el.scrollTop = el.scrollHeight;
    } else {
      el.querySelector<HTMLElement>(`[data-move="${cur}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  });

  async function copyPgn() {
    const text = props.getPgn?.() ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    if (copyTimer !== null) window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => setCopied(false), 1600);
  }

  onCleanup(() => {
    if (copyTimer !== null) window.clearTimeout(copyTimer);
  });

  return (
    <section class="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-alt" aria-label="Move history">
      <header class="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          MOVE LOG
          <span class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink/10 px-1.5 text-[10px] font-bold text-ink-muted">
            {props.moves.length}
          </span>
        </h2>
        <Show when={props.getPgn && props.moves.length > 0}>
          <button
            type="button"
            class="inline-flex cursor-pointer items-center justify-center rounded-md border border-line bg-surface-alt px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink transition-colors hover:border-ink-muted hover:bg-ink/5"
            onClick={copyPgn}
          >
            {copied() ? 'COPIED ✓' : 'COPY PGN'}
          </button>
        </Show>
      </header>

      <Show
        when={props.moves.length > 0}
        fallback={<p class="px-3 py-5 text-center text-[11px] font-bold uppercase tracking-wider text-ink-muted">NO MOVES YET — MAKE THE FIRST ONE LOUD.</p>}
      >
        <Show when={!atEnd()}>
          <div class="flex items-center justify-between border-b border-flame/40 bg-flame/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            <span>REVIEWING</span>
            <button
              type="button"
              class="cursor-pointer underline decoration-dashed underline-offset-2 transition-colors hover:text-amber-900"
              onClick={() => props.onSelectMove(props.moves.length - 1)}
            >
              BACK TO LIVE
            </button>
          </div>
        </Show>
        <div ref={listRef} class="max-h-44 min-h-[4.5rem] overflow-y-auto lg:max-h-56">
          <For each={pairs()}>
            {(p, pairIdx) => (
              <div class="grid grid-cols-[2rem_1fr_1fr] items-stretch">
                <button
                  type="button"
                  class="cursor-pointer py-1 pr-1 text-right font-mono text-[10px] font-bold text-ink-muted transition-colors hover:text-ink"
                  onClick={() => props.onSelectMove(pairIdx() * 2 - 1)}
                  aria-label={`Go to position before move ${p.num}`}
                >
                  {p.num}.
                </button>
                <button
                  type="button"
                  data-move={pairIdx() * 2}
                  classList={{
                    'cursor-pointer py-1 text-left text-[13px] font-medium text-ink transition-colors hover:bg-ink/5': true,
                    'bg-accent-soft font-bold text-accent-strong': props.currentIndex === pairIdx() * 2,
                  }}
                  onClick={() => props.onSelectMove(pairIdx() * 2)}
                >
                  {p.white}
                </button>
                <Show when={p.black} fallback={<span />}>
                  <button
                    type="button"
                    data-move={pairIdx() * 2 + 1}
                    classList={{
                      'cursor-pointer py-1 text-left text-[13px] font-medium text-ink transition-colors hover:bg-ink/5': true,
                      'bg-accent-soft font-bold text-accent-strong': props.currentIndex === pairIdx() * 2 + 1,
                    }}
                    onClick={() => props.onSelectMove(pairIdx() * 2 + 1)}
                  >
                    {p.black}
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
