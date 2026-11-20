import { GRID, snap, type Point, type Rect } from "./geometry";
import type { Side } from "./model";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Position of an anchor on a rectangle. `offset` runs from the left edge
 * on the n and s sides and from the top edge on the e and w sides. It is
 * clamped, so anchors stay on the border after the rectangle shrinks.
 */
export function anchorPoint(r: Rect, side: Side, offset: number): Point {
  switch (side) {
    case "n":
      return { x: r.x + clamp(offset, 0, r.width), y: r.y };
    case "s":
      return { x: r.x + clamp(offset, 0, r.width), y: r.y + r.height };
    case "w":
      return { x: r.x, y: r.y + clamp(offset, 0, r.height) };
    case "e":
      return { x: r.x + r.width, y: r.y + clamp(offset, 0, r.height) };
  }
}

/** The anchor closest to `p`, on the nearest side and snapped to the grid. */
export function nearestAnchor(r: Rect, p: Point): { side: Side; offset: number } {
  const cx = clamp(p.x, r.x, r.x + r.width);
  const cy = clamp(p.y, r.y, r.y + r.height);

  const distances: Array<[Side, number]> = [
    ["n", cy - r.y],
    ["s", r.y + r.height - cy],
    ["w", cx - r.x],
    ["e", r.x + r.width - cx],
  ];
  const [side] = distances.reduce((best, d) => (d[1] < best[1] ? d : best));

  const offset =
    side === "n" || side === "s"
      ? clamp(snap(cx - r.x), 0, r.width)
      : clamp(snap(cy - r.y), 0, r.height);
  return { side, offset };
}

/**
 * Every grid point on the border, each corner once. A rectangle of
 * 15 × 10 grid steps has 2 × (15 + 10) = 50 anchors.
 */
export function allAnchors(r: Rect): Point[] {
  const points: Point[] = [];
  for (let dx = 0; dx <= r.width; dx += GRID) {
    points.push({ x: r.x + dx, y: r.y }, { x: r.x + dx, y: r.y + r.height });
  }
  for (let dy = GRID; dy < r.height; dy += GRID) {
    points.push({ x: r.x, y: r.y + dy }, { x: r.x + r.width, y: r.y + dy });
  }
  return points;
}

/** Shortest distance from `p` to the segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
