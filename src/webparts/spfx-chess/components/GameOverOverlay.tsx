import { For, onCleanup, onMount, Show, type JSX } from 'solid-js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'demo';

export interface GameOverOverlayProps {
  result: string;
  reason: string;
  userWon: boolean;
  saveState: SaveState;
  saveError?: string;
  onNewGame: () => void;
  onHome: () => void;
  onViewMoves: () => void;
  onRetrySave: () => void;
}

const CONFETTI_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#facc15', '#14b8a6'];

const confetti = Array.from({ length: 56 }, (_, i) => ({
  left: Math.random() * 100,
  width: 6 + Math.random() * 6,
  height: 8 + Math.random() * 8,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  duration: 1.9 + Math.random() * 1.8,
  delay: Math.random() * 1.4,
  drift: -60 + Math.random() * 120,
  rot: 300 + Math.random() * 640,
}));

const SMOKES = Array.from({ length: 10 }, (_, i) => ({
  left: 6 + i * 9.4,
  size: 10 + (i % 3) * 7,
  delay: i * 0.6,
  dur: 2.6 + (i % 4) * 0.9,
}));

const BTN =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors active:scale-95';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function GameOverOverlay(props: GameOverOverlayProps): JSX.Element {
  let dialogRef: HTMLDivElement | undefined;
  let newGameBtn: HTMLButtonElement | undefined;
  let prevActive: HTMLElement | null = null;

  function onDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onViewMoves();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef) return;
    const els = Array.from(dialogRef.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (els.length === 0) return;
    const first = els[0];
    const last = els[els.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (!active || !dialogRef.contains(active) || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!active || !dialogRef.contains(active) || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    prevActive = document.activeElement as HTMLElement | null;
    newGameBtn?.focus();
    document.addEventListener('keydown', onDocKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', onDocKeyDown);
    prevActive?.focus();
  });

  const headline = () => {
    if (props.userWon) return 'YOU SMOKED THE MACHINE';
    if (props.result === '1/2-1/2') return 'MUTUAL DESTRUCTION';
    return 'ENGINE PREVAILS';
  };

  const resultLabel = () => (props.result === '1-0' ? '1 – 0' : props.result === '0-1' ? '0 – 1' : '½ – ½');

  const resultClass = () => {
    if (props.userWon) return 'font-mono text-3xl font-black text-lime-600 drop-shadow-[0_0_14px_rgba(216,255,62,0.6)]';
    if (props.result === '1/2-1/2') return 'font-mono text-3xl font-black text-ink-muted';
    return 'font-mono text-3xl font-black text-red-500';
  };

  return (
    <div
      ref={dialogRef}
      class="absolute inset-0 z-20 flex items-center justify-center bg-ash/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rc-gover-title"
      onClick={props.onViewMoves}
    >
      <Show when={props.userWon}>
        <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <For each={confetti}>
            {(c) => (
              <span
                class="animate-confetti-fall absolute top-[-4vh] rounded-[2px]"
                style={{
                  left: `${c.left}%`,
                  width: `${c.width}px`,
                  height: `${c.height}px`,
                  'background-color': c.color,
                  'animation-duration': `${c.duration}s`,
                  'animation-delay': `${c.delay}s`,
                  '--cf-x': `${c.drift}px`,
                  '--cf-rot': `${c.rot}deg`,
                }}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={!props.userWon}>
        <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <For each={SMOKES}>
            {(s) => (
              <span
                class="animate-smoke-rise absolute bottom-0 rounded-full bg-white/60 blur-[1px]"
                style={{
                  left: `${s.left}%`,
                  width: `${s.size}px`,
                  height: `${s.size}px`,
                  'animation-delay': `${s.delay}s`,
                  'animation-duration': `${s.dur}s`,
                }}
              />
            )}
          </For>
        </div>
      </Show>
      <div
        class="animate-fade-slide-in flex w-[min(92%,340px)] flex-col items-center gap-2.5 rounded-xl border border-line bg-surface-alt px-5 py-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rc-gover-title" class="font-display text-2xl font-black uppercase tracking-widest text-ink sm:text-3xl">
          {headline()}
        </h2>
        <p class={resultClass()}>{resultLabel()}</p>
        <p class="text-sm font-medium text-ink-muted">{props.reason}</p>
        <div class="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[10px] font-bold uppercase tracking-wider" role="status" aria-live="polite">
          <Show when={props.saveState === 'saving'}>
            <span class="inline-flex items-center gap-2 text-ink-muted">
              <span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ember/25 border-t-ember" aria-hidden="true" />
              ARCHIVING THE BATTLE…
            </span>
          </Show>
          <Show when={props.saveState === 'saved'}>
            <span class="inline-flex items-center gap-1 text-lime-700">✓ IN THE VAULT</span>
          </Show>
          <Show when={props.saveState === 'demo'}>
            <span class="inline-flex items-center gap-1 text-lime-700">✓ SAVED IN THIS BROWSER</span>
          </Show>
          <Show when={props.saveState === 'error'}>
            <span class="flex flex-col items-center gap-1">
              <span class="text-red-600">COULDN'T ARCHIVE:</span>
              <span class="max-w-full truncate normal-case text-red-600/80" title={props.saveError}>
                {props.saveError || 'unknown failure'}
              </span>
              <button
                type="button"
                class={`${BTN} border-line bg-surface-alt px-2 py-0.5 text-[10px] text-ink hover:border-ink-muted hover:bg-ink/5`}
                onClick={props.onRetrySave}
              >
                RETRY
              </button>
            </span>
          </Show>
          <Show when={props.saveState === 'idle'}>
            <span class="inline-flex items-center gap-2 text-ink-muted">AUTOSAVE IS OFF — THIS ONE FADES INTO NOTHING.</span>
          </Show>
        </div>
        <div class="mt-1 flex flex-wrap justify-center gap-2">
          <button
            ref={newGameBtn}
            type="button"
            class={`${BTN} border-accent bg-accent text-white shadow-md shadow-accent/30 hover:bg-accent-strong`}
            onClick={props.onNewGame}
          >
            RUN IT BACK
          </button>
          <button
            type="button"
            class={`${BTN} border-line bg-surface-alt text-ink hover:border-ink-muted hover:bg-ink/5`}
            onClick={props.onViewMoves}
          >
            INSPECT THE CARNAGE
          </button>
          <button
            type="button"
            class={`${BTN} border-line bg-surface-alt text-ink hover:border-ink-muted hover:bg-ink/5`}
            onClick={props.onHome}
          >
            🏠 HOME
          </button>
        </div>
      </div>
    </div>
  );
}
