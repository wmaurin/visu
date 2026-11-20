import { closestOnSegment, type Point } from "../core/geometry";

/** Polyline helpers shared by routes, hit tests and line labels. */

export function pathData(points: readonly Point[]): string {
  return points.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/**
 * Arrow head at one end of a polyline, as a triangle pointing along the
 * end segment. The size matches the style guide's arrow marker scaled to
 * 10px: 8 long, 7 wide, tip on the end point.
 */
export function arrowHead(points: readonly Point[], atStart: boolean): Point[] | null {
  const tip = atStart ? points[0] : points[points.length - 1];
  const from = atStart ? points[1] : points[points.length - 2];
  if (!tip || !from) return null;
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;

  const ux = dx / length;
  const uy = dy / length;
  const base = { x: tip.x - ux * 8, y: tip.y - uy * 8 };
  return [tip, { x: base.x - uy * 3.5, y: base.y + ux * 3.5 }, { x: base.x + uy * 3.5, y: base.y - ux * 3.5 }];
}

/** Shortest distance from `p` to a polyline. */
export function distanceToPolyline(p: Point, points: readonly Point[]): number {
  let best = Infinity;
  for (let k = 1; k < points.length; k++) {
    best = Math.min(best, closestOnSegment(p, points[k - 1]!, points[k]!).distance);
  }
  return best;
}

/** Cumulative length at each point of a polyline. The first entry is 0. */
function cumulativeLengths(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    lengths.push(lengths[k - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return lengths;
}

/**
 * Point at fraction `t` of the polyline's arc length. Labels store `t`,
 * so they keep their relative place when the route changes shape.
 */
export function pointAlong(points: readonly Point[], t: number): Point {
  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1]!;
  if (total === 0) return points[0]!;

  const target = Math.min(Math.max(t, 0), 1) * total;
  for (let k = 1; k < points.length; k++) {
    if (lengths[k]! >= target) {
      const a = points[k - 1]!;
      const b = points[k]!;
      const segment = lengths[k]! - lengths[k - 1]!;
      const u = segment === 0 ? 0 : (target - lengths[k - 1]!) / segment;
      return { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y) };
    }
  }
  return points[points.length - 1]!;
}

/**
 * Projects `p` onto the polyline and returns the arc length fraction of
 * the closest point. The inverse of `pointAlong`.
 */
export function fractionAlong(points: readonly Point[], p: Point): number {
  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1]!;
  if (total === 0) return 0;

  let best = { distance: Infinity, length: 0 };
  for (let k = 1; k < points.length; k++) {
    const { u, distance } = closestOnSegment(p, points[k - 1]!, points[k]!);
    if (distance < best.distance) {
      best = { distance, length: lengths[k - 1]! + u * (lengths[k]! - lengths[k - 1]!) };
    }
  }
  return best.length / total;
}
