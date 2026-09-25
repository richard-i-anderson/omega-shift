/**
 * A stroke font in the style of the old vector arcade games: every glyph is a
 * few polylines on a 4×6 grid (y down, 0 at the cap line), drawn as lines
 * rather than filled outlines. Upper case only; lower case is drawn as upper.
 * Unknown characters are blank.
 */
type Glyph = readonly (readonly (readonly [number, number])[])[];

const G: Record<string, Glyph> = {
  A: [[[0, 6], [0, 2], [2, 0], [4, 2], [4, 6]], [[0, 4], [4, 4]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  C: [[[4, 0], [0, 0], [0, 6], [4, 6]]],
  D: [[[0, 0], [0, 6], [2, 6], [4, 4], [4, 2], [2, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [4, 0], [0, 0], [0, 6], [4, 6], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[0, 0], [4, 0]], [[2, 0], [2, 6]], [[0, 6], [4, 6]]],
  J: [[[4, 0], [4, 6], [2, 6], [0, 4]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 2], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]],
  P: [[[0, 6], [0, 0], [4, 0], [4, 3], [0, 3]]],
  Q: [[[0, 0], [4, 0], [4, 4], [2, 6], [0, 6], [0, 0]], [[2, 4], [4, 6]]],
  R: [[[0, 6], [0, 0], [4, 0], [4, 3], [0, 3]], [[1, 3], [4, 6]]],
  S: [[[4, 0], [0, 0], [0, 3], [4, 3], [4, 6], [0, 6]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 6], [4, 6], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 4], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 2], [4, 0]], [[2, 2], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  // Zero is slashed so it can't be read as O.
  '0': [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[4, 0], [0, 6]]],
  '1': [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  '2': [[[0, 0], [4, 0], [4, 3], [0, 3], [0, 6], [4, 6]]],
  '3': [[[0, 0], [4, 0], [4, 6], [0, 6]], [[1, 3], [4, 3]]],
  '4': [[[0, 0], [0, 3], [4, 3]], [[4, 0], [4, 6]]],
  '5': [[[4, 0], [0, 0], [0, 2], [3, 2], [4, 3], [4, 5], [3, 6], [0, 6]]],
  '6': [[[4, 0], [0, 0], [0, 6], [4, 6], [4, 3], [0, 3]]],
  '7': [[[0, 0], [4, 0], [1, 6]]],
  '8': [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[0, 3], [4, 3]]],
  '9': [[[4, 3], [0, 3], [0, 0], [4, 0], [4, 6], [0, 6]]],
  // Dots are very short strokes; round caps turn them into dots.
  '.': [[[2, 5.7], [2, 6]]],
  ',': [[[2, 5], [1, 7]]],
  "'": [[[2, 0], [2, 1.5]]],
  '"': [[[1, 0], [1, 1.5]], [[3, 0], [3, 1.5]]],
  '!': [[[2, 0], [2, 4]], [[2, 5.7], [2, 6]]],
  '?': [[[0, 1], [0, 0], [4, 0], [4, 2], [2, 3], [2, 4]], [[2, 5.7], [2, 6]]],
  '-': [[[1, 3], [3, 3]]],
  ':': [[[2, 1.7], [2, 2]], [[2, 4.7], [2, 5]]],
  '/': [[[4, 0], [0, 6]]],
  '(': [[[3, 0], [1, 2], [1, 4], [3, 6]]],
  ')': [[[1, 0], [3, 2], [3, 4], [1, 6]]],
  '+': [[[2, 1.5], [2, 4.5]], [[0.5, 3], [3.5, 3]]],
};

/** Grid units from one character's left edge to the next. */
const ADVANCE = 6;
const CAP = 6;

/** Width in px of `text` at cap height `size`. */
export function textWidth(text: string, size: number): number {
  return text.length ? ((text.length * ADVANCE - (ADVANCE - 4)) * size) / CAP : 0;
}

/** Whether the font has a glyph for `ch` (a space is always fine). */
export function hasGlyph(ch: string): boolean {
  return ch === ' ' || ch.toUpperCase() in G;
}

/**
 * Add `text` to the current path with its top-left corner at (x, y), cap
 * height `size` px. The caller begins the path and strokes it, so a whole
 * page of text can go out in one stroke.
 */
export function vectorTextPath(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  const u = size / CAP;
  for (let i = 0; i < text.length; i++) {
    const glyph = G[text[i].toUpperCase()];
    if (!glyph) continue;
    const ox = x + i * ADVANCE * u;
    for (const line of glyph) {
      ctx.moveTo(ox + line[0][0] * u, y + line[0][1] * u);
      for (let k = 1; k < line.length; k++) ctx.lineTo(ox + line[k][0] * u, y + line[k][1] * u);
    }
  }
}
