export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Snap step and grid dot spacing in diagram units. Must stay a multiple
 * of 8, the base unit of the style guide.
 */
export const GRID = 16;

/** Smallest width and height a shape may have. */
export const MIN_SHAPE_SIZE = GRID;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function snap(value: number, step = GRID): number {
  return Math.round(value / step) * step;
}

export function snapPoint(p: Point, step = GRID): Point {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Inclusive bounds, so a click exactly on the border still hits. */
export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** The rectangle grown by `by` on every side. */
export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

export function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Normalised rectangle spanned by two corner points, independent of drag
 * direction. With `square` the shorter side grows to match the longer one.
 */
export function rectFromPoints(a: Point, b: Point, square = false): Rect {
  let dx = b.x - a.x;
  let dy = b.y - a.y;

  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }

  return {
    x: Math.min(a.x, a.x + dx),
    y: Math.min(a.y, a.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}

/** Closest point on the segment a–b: its parameter u in [0, 1] and distance. */
export function closestOnSegment(p: Point, a: Point, b: Point): { u: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const u = lengthSq === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
  return { u, distance: Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)) };
}
