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

export function snap(value: number, step = GRID): number {
  return Math.round(value / step) * step;
}

export function snapPoint(p: Point, step = GRID): Point {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}

/** Inclusive bounds, so a click exactly on the border still hits. */
export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
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
