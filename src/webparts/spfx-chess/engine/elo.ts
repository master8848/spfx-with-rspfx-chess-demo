// Stockfish's native handicap is UCI_LimitStrength + UCI_Elo (+ Skill Level).
// See https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html
// and FAQ "How do Skill Level and UCI_Elo work" + PR #4341.
// UCI_Elo is only valid 1320-3190 (calibrated CCRL blitz 120s+1s). Below 1320
// Stockfish clamps to Skill 0 (~1320); we simulate weaker levels with
// shallow depth + short movetime (like lichess fishnet LVL_DEPTHS/LVL_MOVETIMES).
// Always delegate weakening to the engine — no JS random blunder / uniform pick.

export interface EloConfig {
  key: string;
  label: string;
  /** Display Elo (human-facing). */
  elo: number;
  /** Time budget for `go movetime`. */
  movetime: number;
  /** Optional depth cap for sub-1320 levels to push below Stockfish's floor. */
  depth?: number;
  /** Whether to enable UCI_LimitStrength. */
  limitStrength: boolean;
  /** Target Elo when limitStrength is true. Clamped to 1320-3190 by caller. */
  uciElo?: number;
  /** Skill Level 0-20 when limitStrength is false (20 = full strength). */
  skillLevel: number;
}

export const ELO_LEVELS: EloConfig[] = [
  // <1320: Stockfish cannot go that low via UCI_Elo alone. Skill 0 = ~1320,
  // so we add depth caps (fishnet uses depth 1-3 for its weakest levels).
  { key: 'novice', label: 'Novice', elo: 700, movetime: 50, depth: 1, limitStrength: false, skillLevel: 0 },
  { key: 'casual', label: 'Casual', elo: 1000, movetime: 100, depth: 3, limitStrength: false, skillLevel: 0 },
  // 1300 is just below the 1320 floor — map to the minimum valid UCI_Elo.
  { key: 'club', label: 'Club Player', elo: 1300, movetime: 200, limitStrength: true, uciElo: 1350, skillLevel: 20 },
  { key: 'expert', label: 'Expert', elo: 1700, movetime: 400, limitStrength: true, uciElo: 1700, skillLevel: 20 },
  { key: 'master', label: 'Master', elo: 2100, movetime: 800, limitStrength: true, uciElo: 2100, skillLevel: 20 },
  { key: 'gm', label: 'Grandmaster', elo: 2500, movetime: 1000, limitStrength: true, uciElo: 2500, skillLevel: 20 },
  // Full strength: UCI_LimitStrength off, Skill 20, MultiPV 1 (engine's max).
  { key: 'stockfish', label: 'Stockfish', elo: 2850, movetime: 1500, limitStrength: false, skillLevel: 20 },
];

export function eloConfig(key: string): EloConfig {
  return ELO_LEVELS.find((l) => l.key === key) ?? ELO_LEVELS[3]!;
}

// Kept for backwards compat if anything imports them; no longer used internally.
export interface PvLine {
  move: string;
  score: number;
  mate: boolean;
}
export function parsePvs(_output: string): PvLine[] {
  return [];
}
export function pickMove(_pvs: PvLine[], _config: EloConfig, fallback: string[]): string {
  return fallback[0] ?? '';
}
