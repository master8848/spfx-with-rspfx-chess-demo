export type MovePick = 'best' | 'weighted' | 'uniform';

export interface EloConfig {
  key: string;
  label: string;
  elo: number;
  movetime: number;
  multiPv: number;
  pick: MovePick;
  blunder: number;
}

export const ELO_LEVELS: EloConfig[] = [
  { key: 'novice', label: 'Novice', elo: 700, movetime: 15, multiPv: 8, pick: 'uniform', blunder: 0.35 },
  { key: 'casual', label: 'Casual', elo: 1000, movetime: 30, multiPv: 8, pick: 'uniform', blunder: 0.12 },
  { key: 'club', label: 'Club Player', elo: 1300, movetime: 50, multiPv: 5, pick: 'weighted', blunder: 0.04 },
  { key: 'expert', label: 'Expert', elo: 1700, movetime: 100, multiPv: 3, pick: 'weighted', blunder: 0 },
  { key: 'master', label: 'Master', elo: 2100, movetime: 220, multiPv: 2, pick: 'weighted', blunder: 0 },
  { key: 'gm', label: 'Grandmaster', elo: 2500, movetime: 500, multiPv: 1, pick: 'best', blunder: 0 },
  { key: 'stockfish', label: 'Stockfish', elo: 2800, movetime: 1500, multiPv: 1, pick: 'best', blunder: 0 },
];

export function eloConfig(key: string): EloConfig {
  return ELO_LEVELS.find((l) => l.key === key) ?? ELO_LEVELS[3];
}

export interface PvLine {
  move: string;
  score: number;
  mate: boolean;
}

export function parsePvs(output: string): PvLine[] {
  const pvs: PvLine[] = [];
  for (const line of output.split('\n')) {
    if (!line.startsWith('info') || !line.includes(' pv ')) continue;
    const multipv = Number(line.match(/multipv (\d+)/)?.[1] ?? 1);
    const scoreCp = line.match(/score cp (-?\d+)/)?.[1];
    const scoreMate = line.match(/score mate (-?\d+)/)?.[1];
    const pv = line.match(/pv ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1];
    if (!pv) continue;
    const mate = scoreMate !== undefined;
    const score = mate
      ? (Number(scoreMate) > 0 ? 100000 - Number(scoreMate) : -100000 - Number(scoreMate))
      : Number(scoreCp ?? 0);
    pvs[multipv - 1] = { move: pv, score, mate };
  }
  return pvs.filter((p) => p !== undefined);
}

export function pickMove(pvs: PvLine[], config: EloConfig, fallback: string[]): string {
  const candidates = pvs.length > 0 ? pvs : fallback.map((m) => ({ move: m, score: 0, mate: false }));
  if (candidates.length === 0) return '';
  if (config.pick === 'best') return candidates[0].move;
  if (config.pick === 'uniform') {
    const pool = candidates.slice(0, Math.min(config.multiPv, candidates.length));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  const pool = candidates.slice(0, Math.max(1, Math.min(config.multiPv, candidates.length)));
  const maxScore = Math.max(...pool.map((p) => p.score));
  const weights = pool.map((p) => Math.exp((p.score - maxScore) / 40));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].move;
  }
  return pool[pool.length - 1].move;
}
