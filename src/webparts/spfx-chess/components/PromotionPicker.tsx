import { For, onCleanup, onMount, type JSX } from 'solid-js';
import { PIECE_GLYPH, type PieceColor, type PieceKind } from '../game/model';

export interface PromotionPickerProps {
  color: PieceColor;
  onSelect: (kind: PieceKind) => void;
  onCancel: () => void;
}

const PIECES: { kind: PieceKind; label: string }[] = [
  { kind: 'q', label: 'Queen' },
  { kind: 'r', label: 'Rook' },
  { kind: 'b', label: 'Bishop' },
  { kind: 'n', label: 'Knight' },
];

export default function PromotionPicker(props: PromotionPickerProps): JSX.Element {
  let panelRef: HTMLDivElement | undefined;
  let prevActive: HTMLElement | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    const btns = Array.from(panelRef?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onCancel();
      return;
    }
    if (e.key === 'Tab' && panelRef) {
      if (btns.length === 0) return;
      const first = btns[0];
      const last = btns[btns.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (!active || !panelRef.contains(active) || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!active || !panelRef.contains(active) || active === last)) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(idx + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(idx < 0 ? btns.length : idx) - 1]?.focus();
    }
  };

  onMount(() => {
    prevActive = document.activeElement as HTMLElement | null;
    panelRef?.querySelectorAll<HTMLButtonElement>('button')[0]?.focus();
    document.addEventListener('keydown', onKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown);
    prevActive?.focus();
  });

  return (
    <div
      class="absolute inset-0 z-20 flex items-center justify-center bg-ash/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a promotion piece"
      onClick={props.onCancel}
    >
      <div
        ref={panelRef}
        class="animate-fade-slide-in flex gap-2 rounded-xl border border-line bg-surface-alt p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <For each={PIECES}>
          {(p, i) => (
            <button
              type="button"
              class="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md active:scale-95"
              aria-label={`Promote to ${p.label}`}
              onClick={() => props.onSelect(p.kind)}
            >
              <span
                class="animate-promo-bounce inline-flex select-none font-chess text-5xl leading-none"
                classList={{
                  'text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]': props.color === 'w',
                  'text-neutral-900 drop-shadow-[0_2px_2px_rgba(255,255,255,0.4)]': props.color === 'b',
                }}
                style={{ 'animation-delay': `${i() * 45}ms` }}
              >
                {PIECE_GLYPH[p.kind][props.color]}
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
