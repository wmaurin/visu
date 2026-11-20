import type { Point, Rect } from "./geometry";

/** Tag height from the style guide. */
export const TAG_HEIGHT = 20;

/**
 * Tag width from the style guide: characters × 6.6 + 16, rounded to an
 * even number. Fits the 11px monospace label text.
 */
export function tagWidth(text: string): number {
  return Math.ceil((text.length * 6.6 + 16) / 2) * 2;
}

/** Box of a tag centred on `centre`. */
export function tagBox(centre: Point, text: string): Rect {
  const width = tagWidth(text);
  return { x: centre.x - width / 2, y: centre.y - TAG_HEIGHT / 2, width, height: TAG_HEIGHT };
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

  let bestDistance = Infinity;
  let bestLength = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const u =
      lengthSq === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0), 1);
    const distance = Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLength = lengths[k - 1]! + u * Math.sqrt(lengthSq);
    }
  }
  return bestLength / total;
}
