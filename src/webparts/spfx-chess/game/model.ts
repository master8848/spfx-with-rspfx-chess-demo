export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export const PIECE_GLYPH: Record<PieceKind, Record<PieceColor, string>> = {
  k: { w: '♔', b: '♚' },
  q: { w: '♕', b: '♛' },
  r: { w: '♖', b: '♜' },
  b: { w: '♗', b: '♝' },
  n: { w: '♘', b: '♞' },
  p: { w: '♙', b: '♟' },
};
