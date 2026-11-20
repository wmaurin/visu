import { GRID, snap, type Point, type Rect } from "./geometry";

export type Routing = "straight" | "orthogonal";

/** Direction index: 0 east, 1 south, 2 west, 3 north. */
export type Dir = 0 | 1 | 2 | 3;

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * A line end as the router sees it. `out` is the direction the line must
 * leave in (and, at the target, arrive against). null means any direction,
 * as for free ends.
 */
export interface RouteEnd {
  readonly point: Point;
  readonly out: Dir | null;
}

/** Extra cost of a bend, in grid steps. Higher values give fewer bends. */
const BEND_PENALTY = 4;
/** Extra cost of a step right next to a shape, so routes keep some distance. */
const PROXIMITY_PENALTY = 0.5;
/** Search area around the two ends, in grid steps. */
const SEARCH_MARGIN = 8;

/** Polyline from `a` to `b`. Obstacles are the shapes the route must avoid. */
export function computeRoute(
  a: RouteEnd,
  b: RouteEnd,
  routing: Routing,
  obstacles: readonly Rect[],
): Point[] {
  if (routing === "straight") return [a.point, b.point];
  return orthogonalRoute(a, b, obstacles) ?? elbowRoute(a, b);
}

/**
 * A* over grid points. State is (point, direction of the last step), so
 * bends can be charged. Points on or inside a shape are blocked, except the
 * two ends. Tries a small area around the ends first, then one that covers
 * every obstacle, so detours around large shapes are still found.
 */
function orthogonalRoute(a: RouteEnd, b: RouteEnd, obstacles: readonly Rect[]): Point[] | null {
  if (!onGrid(a.point) || !onGrid(b.point)) return null;

  const near = boundsAround([a.point, b.point], SEARCH_MARGIN);
  const wide = boundsAround(
    [a.point, b.point, ...obstacles.flatMap((r) => [r, { x: r.x + r.width, y: r.y + r.height }])],
    2,
  );
  return search(a, b, obstacles, near) ?? search(a, b, obstacles, wide);
}

interface Bounds {
  readonly minI: number;
  readonly minJ: number;
  readonly maxI: number;
  readonly maxJ: number;
}

function boundsAround(points: readonly Point[], margin: number): Bounds {
  const is = points.map((p) => p.x / GRID);
  const js = points.map((p) => p.y / GRID);
  return {
    minI: Math.floor(Math.min(...is)) - margin,
    minJ: Math.floor(Math.min(...js)) - margin,
    maxI: Math.ceil(Math.max(...is)) + margin,
    maxJ: Math.ceil(Math.max(...js)) + margin,
  };
}

function search(a: RouteEnd, b: RouteEnd, obstacles: readonly Rect[], bounds: Bounds): Point[] | null {
  const { minI, minJ, maxI, maxJ } = bounds;
  const width = maxI - minI + 1;
  const height = maxJ - minJ + 1;
  const cells = width * height;

  const cell = (i: number, j: number) => (j - minJ) * width + (i - minI);
  const si = a.point.x / GRID;
  const sj = a.point.y / GRID;
  const ti = b.point.x / GRID;
  const tj = b.point.y / GRID;
  const start = cell(si, sj);
  const target = cell(ti, tj);

  const blocked = new Uint8Array(cells);
  for (const r of obstacles) {
    const i0 = Math.max(Math.ceil(r.x / GRID), minI);
    const i1 = Math.min(Math.floor((r.x + r.width) / GRID), maxI);
    const j0 = Math.max(Math.ceil(r.y / GRID), minJ);
    const j1 = Math.min(Math.floor((r.y + r.height) / GRID), maxJ);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[cell(i, j)] = 1;
  }
  blocked[start] = 0;
  blocked[target] = 0;

  // Free points next to a shape, including diagonally.
  const near = new Uint8Array(cells);
  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      if (!blocked[cell(i, j)]) continue;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ni = i + di;
          const nj = j + dj;
          if (ni >= minI && ni <= maxI && nj >= minJ && nj <= maxJ) near[cell(ni, nj)] = 1;
        }
      }
    }
  }

  const isFree = (p: Point) => {
    const i = p.x / GRID;
    const j = p.y / GRID;
    return i >= minI && i <= maxI && j >= minJ && j <= maxJ && !blocked[cell(i, j)];
  };

  const arrive: Dir | null = b.out === null ? null : (((b.out + 2) % 4) as Dir);
  const cost = new Float64Array(cells * 4).fill(Infinity);
  const from = new Int32Array(cells * 4).fill(-1);
  const heap = new MinHeap();
  const h = (i: number, j: number) => Math.abs(i - ti) + Math.abs(j - tj);

  for (const d of a.out === null ? ([0, 1, 2, 3] as const) : [a.out]) {
    const state = start * 4 + d;
    cost[state] = 0;
    heap.push(h(si, sj), state);
  }

  while (heap.size > 0) {
    const state = heap.pop();
    const c = state >> 2;
    const d = (state & 3) as Dir;
    const i = (c % width) + minI;
    const j = Math.floor(c / width) + minJ;

    if (c === target) {
      if (arrive === null || d === arrive) {
        return centreZ(toPolyline(state, from, width, minI, minJ), isFree);
      }
      continue; // Reached from the wrong side. The border behind it is blocked.
    }

    for (let nd = 0 as Dir; nd < 4; nd = (nd + 1) as Dir) {
      if (nd === (d + 2) % 4) continue; // No U-turns on the spot.
      // Leave an anchored start straight out, never along its border.
      if (c === start && a.out !== null && nd !== a.out) continue;

      const [dx, dy] = STEPS[nd]!;
      const ni = i + dx;
      const nj = j + dy;
      if (ni < minI || ni > maxI || nj < minJ || nj > maxJ) continue;
      const nc = cell(ni, nj);
      if (blocked[nc]) continue;

      const next = nc * 4 + nd;
      const g =
        cost[state]! +
        1 +
        (nd === d ? 0 : BEND_PENALTY) +
        (near[nc] && nc !== target ? PROXIMITY_PENALTY : 0);
      if (g < cost[next]!) {
        cost[next] = g;
        from[next] = state;
        heap.push(g + h(ni, nj), next);
      }
    }
  }
  return null;
}

function toPolyline(goal: number, from: Int32Array, width: number, minI: number, minJ: number): Point[] {
  const points: Point[] = [];
  for (let s = goal; s !== -1; s = from[s]!) {
    const c = s >> 2;
    points.push({ x: ((c % width) + minI) * GRID, y: (Math.floor(c / width) + minJ) * GRID });
  }
  return simplify(points.reverse());
}

/**
 * A* picks any of several equally cheap Z routes, often with the middle
 * run right next to one end. This moves the middle run halfway between
 * the ends, if that keeps the leave and arrive directions and all points
 * along the new route are free.
 */
function centreZ(points: Point[], isFree: (p: Point) => boolean): Point[] {
  if (points.length !== 4) return points;
  const [p0, p1, p2, p3] = points as [Point, Point, Point, Point];

  let candidate: Point[];
  if (p0.y === p1.y && p2.y === p3.y) {
    const mid = snap((p0.x + p3.x) / 2);
    if (Math.sign(mid - p0.x) !== Math.sign(p1.x - p0.x)) return points;
    if (Math.sign(p3.x - mid) !== Math.sign(p3.x - p2.x)) return points;
    candidate = [p0, { x: mid, y: p0.y }, { x: mid, y: p3.y }, p3];
  } else if (p0.x === p1.x && p2.x === p3.x) {
    const mid = snap((p0.y + p3.y) / 2);
    if (Math.sign(mid - p0.y) !== Math.sign(p1.y - p0.y)) return points;
    if (Math.sign(p3.y - mid) !== Math.sign(p3.y - p2.y)) return points;
    candidate = [p0, { x: p0.x, y: mid }, { x: p3.x, y: mid }, p3];
  } else {
    return points;
  }

  return gridPointsAlong(candidate).every(isFree) ? candidate : points;
}

/** Grid points along a polyline, without its two ends. */
function gridPointsAlong(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / GRID;
    const sx = Math.sign(b.x - a.x) * GRID;
    const sy = Math.sign(b.y - a.y) * GRID;
    for (let s = 1; s <= steps; s++) out.push({ x: a.x + s * sx, y: a.y + s * sy });
  }
  out.pop(); // The route's end point sits on a shape border.
  return out;
}

/**
 * Fallback without obstacle avoidance: leave along the start direction,
 * cross over halfway and arrive straight.
 */
function elbowRoute(a: RouteEnd, b: RouteEnd): Point[] {
  const s = a.point;
  const e = b.point;
  const horizontal = a.out === null ? Math.abs(e.x - s.x) >= Math.abs(e.y - s.y) : a.out % 2 === 0;

  if (horizontal) {
    const midX = (s.x + e.x) / 2;
    return simplify([s, { x: midX, y: s.y }, { x: midX, y: e.y }, e]);
  }
  const midY = (s.y + e.y) / 2;
  return simplify([s, { x: s.x, y: midY }, { x: e.x, y: midY }, e]);
}

/** Drops duplicate points and points in the middle of a straight run. */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) {
      out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  }
  return out;
}

function onGrid(p: Point): boolean {
  return p.x % GRID === 0 && p.y % GRID === 0;
}

/** Binary min-heap of (priority, value) pairs. */
class MinHeap {
  private readonly priorities: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.values.length;
  }

  push(priority: number, value: number): void {
    this.priorities.push(priority);
    this.values.push(value);
    let i = this.values.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent]! <= priority) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.values[0]!;
    const lastPriority = this.priorities.pop()!;
    const lastValue = this.values.pop()!;
    if (this.values.length > 0) {
      this.priorities[0] = lastPriority;
      this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.values.length && this.priorities[l]! < this.priorities[m]!) m = l;
        if (r < this.values.length && this.priorities[r]! < this.priorities[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(i: number, j: number): void {
    [this.priorities[i], this.priorities[j]] = [this.priorities[j]!, this.priorities[i]!];
    [this.values[i], this.values[j]] = [this.values[j]!, this.values[i]!];
  }
}

/** Shortest distance from `p` to a polyline. */
export function distanceToPolyline(p: Point, points: readonly Point[]): number {
  let best = Infinity;
  for (let k = 1; k < points.length; k++) {
    best = Math.min(best, distanceToSegment(p, points[k - 1]!, points[k]!));
  }
  return best;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0), 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pathData(points: readonly Point[]): string {
  return points.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}
