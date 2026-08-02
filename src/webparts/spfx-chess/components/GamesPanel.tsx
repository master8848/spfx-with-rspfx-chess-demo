import { createQuery } from '@tanstack/solid-query';
import {
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/solid-table';
import { createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import type { GameStore, SavedGame, StoreMode } from '../services/gameStore';

export interface GamesPanelProps {
  store: GameStore | null;
  mode: StoreMode;
  listName: string;
  onLoad: (game: SavedGame) => void;
  onDelete: (id: number | string) => Promise<void>;
}

const fmtDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const fmtEval = (evalCp: number) => {
  if (evalCp === 0) return '—';
  if (Math.abs(evalCp) >= 90000) return evalCp > 0 ? `M${100000 - evalCp}` : `−M${100000 + evalCp}`;
  return `${evalCp > 0 ? '+' : ''}${(evalCp / 100).toFixed(1)}`;
};

const fmtTime = (ms: number) => {
  if (ms <= 0) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const resultBadgeClass = (r: string) =>
  r === '1-0'
    ? 'inline-flex items-center rounded-full border border-lime-600/40 bg-lime-600/10 px-1.5 py-0.5 text-[10px] font-bold text-lime-700'
    : r === '0-1'
      ? 'inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600'
      : 'inline-flex items-center rounded-full border border-line bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-ink-muted';

const resultLabel = (r: string) => (r === '1-0' ? '1–0' : r === '0-1' ? '0–1' : '½–½');

const tdClass = (id: string) => {
  if (id === 'created' || id === 'rating' || id === 'eval' || id === 'duration') {
    return 'px-1.5 py-1.5 align-middle whitespace-nowrap text-[11px] text-ink-muted';
  }
  if (id === 'actions') {
    return 'px-1.5 py-1.5 align-middle whitespace-nowrap';
  }
  return 'px-1.5 py-1.5 align-middle text-[13px]';
};

export default function GamesPanel(props: GamesPanelProps): JSX.Element {
  const [deletingId, setDeletingId] = createSignal<number | string | null>(null);
  const [armingId, setArmingId] = createSignal<number | string | null>(null);
  const [sorting, setSorting] = createSignal<SortingState>([{ id: 'created', desc: true }]);
  let disarmTimer: ReturnType<typeof setTimeout> | null = null;

  const gamesQuery = createQuery(() => ({
    queryKey: ['chess-games', props.listName],
    queryFn: () => props.store?.listGames() ?? Promise.resolve([]),
    enabled: () => props.store !== null,
    staleTime: 30000,
  }));

  const loading = () => props.store === null || gamesQuery.isLoading;
  const games = () => gamesQuery.data ?? [];

  const disarm = () => {
    if (disarmTimer !== null) {
      clearTimeout(disarmTimer);
      disarmTimer = null;
    }
    setArmingId(null);
  };

  onCleanup(disarm);

  const handleDelete = (game: SavedGame) => {
    if (armingId() === game.id) {
      disarm();
      setDeletingId(game.id);
      props.onDelete(game.id).finally(() => setDeletingId(null));
      return;
    }
    disarm();
    setArmingId(game.id);
    disarmTimer = setTimeout(disarm, 2000);
  };

  const columns: ColumnDef<SavedGame>[] = [
    {
      accessorKey: 'created',
      header: 'Date',
      size: 76,
      cell: (info) => <span class="tabular-nums">{fmtDate(info.getValue<string>())}</span>,
    },
    {
      accessorKey: 'title',
      header: 'Game',
      enableSorting: false,
      cell: (info) => {
        const g = info.row.original;
        return (
          <button
            type="button"
            class="min-w-0 w-full flex-1 rounded px-1.5 py-1 text-left hover:bg-ink/5"
            onClick={() => props.onLoad(g)}
            aria-label={`Open game: ${g.title}`}
            title={g.title}
          >
            <span class="block truncate text-[13px] font-medium text-ink">{g.title}</span>
          </button>
        );
      },
    },
    {
      accessorKey: 'result',
      header: 'Result',
      enableSorting: false,
      size: 42,
      cell: (info) => {
        const r = info.getValue<string>();
        return <span class={resultBadgeClass(r)}>{resultLabel(r)}</span>;
      },
    },
    {
      accessorFn: (g) => Math.max(g.whiteElo, g.blackElo),
      id: 'rating',
      header: 'Rating',
      size: 56,
      cell: (info) => {
        const g = info.row.original;
        return (
          <span class="tabular-nums">
            {g.whiteElo > 0 ? g.whiteElo : '?'} – {g.blackElo > 0 ? g.blackElo : '?'}
          </span>
        );
      },
    },
    {
      accessorFn: (g) => g.eval,
      id: 'eval',
      header: 'Eval',
      size: 38,
      cell: (info) => <span class="tabular-nums">{fmtEval(info.row.original.eval)}</span>,
    },
    {
      accessorFn: (g) => g.durationMs,
      id: 'duration',
      header: 'Time',
      size: 34,
      cell: (info) => <span class="tabular-nums">{fmtTime(info.row.original.durationMs)}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      size: 66,
      cell: (info) => {
        const g = info.row.original;
        return (
          <div class="flex items-center justify-end gap-1">
            <button
              type="button"
              class="inline-flex cursor-pointer items-center justify-center rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent/15"
              onClick={() => {
                disarm();
                props.onLoad(g);
              }}
              aria-label={`Load game: ${g.title}`}
            >
              Load
            </button>
            <button
              type="button"
              classList={{
                'shrink-0 cursor-pointer rounded-md p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent': true,
                'animate-pulse border border-red-500/60 bg-red-500/15 text-red-600': armingId() === g.id,
                'text-ink-muted hover:bg-red-500/10 hover:text-red-600': armingId() !== g.id,
              }}
              onClick={() => handleDelete(g)}
              disabled={deletingId() === g.id}
              aria-label={armingId() === g.id ? `Confirm delete game: ${g.title}` : `Delete game: ${g.title}`}
            >
              {deletingId() === g.id ? (
                <span
                  class="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink-muted"
                  aria-hidden="true"
                />
              ) : armingId() === g.id ? (
                <span class="px-0.5 text-[10px] font-black uppercase tracking-wider">Sure?</span>
              ) : (
                <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.6 8.2a1 1 0 0 0 1 .8h4.8a1 1 0 0 0 1-.8L12 4.5M6.5 7v4M9.5 7v4"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        );
      },
    },
  ];

  const table = createSolidTable({
    get data() {
      return games();
    },
    columns,
    state: {
      get sorting() {
        return sorting();
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <section
      class="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-alt"
      aria-label="Saved games"
    >
      <div class="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Saved games
          <span class="ml-1 rounded-full bg-black/5 px-1.5 text-[10px] font-bold text-ink-muted">
            {gamesQuery.data?.length ?? 0}
          </span>
        </h2>
      </div>

      <Show when={props.mode === 'demo'}>
        <p class="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
          Demo mode — games are saved in this browser only.
        </p>
      </Show>

      <div class="max-h-72 overflow-y-auto">
        <Show
          when={!loading()}
          fallback={
            <p class="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-ink-muted">
              <span
                class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink-muted"
                aria-hidden="true"
              />
              Loading saved games…
            </p>
          }
        >
          <Show
            when={!gamesQuery.isError}
            fallback={
              <div class="flex items-center justify-between gap-2 px-3 py-4 text-[13px]">
                <span class="text-ink-muted">Couldn't load saved games.</span>
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center justify-center rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent/15"
                  onClick={() => void gamesQuery.refetch()}
                >
                  Retry
                </button>
              </div>
            }
          >
            <Show
              when={games().length > 0}
              fallback={
                <p class="px-3 py-6 text-center text-[13px] italic text-ink-muted">
                  The vault is empty. Finish a game and it lands here.
                </p>
              }
            >
              <table class="w-full table-fixed">
                <thead>
                  <For each={table.getHeaderGroups()}>
                    {(headerGroup) => (
                      <tr>
                        <For each={headerGroup.headers}>
                          {(header) => (
                            <Show when={!header.isPlaceholder}>
                              <th
                                class="sticky top-0 z-10 bg-surface-alt px-1.5 py-1.5 text-left"
                                style={
                                  header.column.id === 'game'
                                    ? undefined
                                    : { width: `${header.column.getSize()}px` }
                                }
                              >
                                {header.column.getCanSort() ? (
                                  <button
                                    type="button"
                                    class="inline-flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
                                    onClick={header.column.getToggleSortingHandler()!}
                                    aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                                  >
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                    <Show when={header.column.getIsSorted() !== false}>
                                      <span class="text-[9px] leading-none">
                                        {header.column.getIsSorted() === 'asc' ? '▲' : '▼'}
                                      </span>
                                    </Show>
                                  </button>
                                ) : (
                                  <span class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                  </span>
                                )}
                              </th>
                            </Show>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </thead>
                <tbody class="divide-y divide-line">
                  <For each={table.getRowModel().rows}>
                    {(row) => (
                      <tr class="hover:bg-ink/5">
                        <For each={row.getVisibleCells()}>
                          {(cell) => (
                            <td
                              class={tdClass(cell.column.id)}
                              style={
                                cell.column.id === 'game'
                                  ? undefined
                                  : { width: `${cell.column.getSize()}px` }
                              }
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </Show>
        </Show>
      </div>
    </section>
  );
}
