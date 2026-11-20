import { grid, snap, type Point, type Rect } from "../core/geometry";
import type { Routing } from "../model/types";

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

/**
 * The router's own lattice in px, independent of the grid setting. Every
 * grid size on offer is a multiple of it, so every position ever created
 * lies on it and routes work at any grid size.
 */
const STEP = 8;
/** Lines leave and reach an anchor straight for at least this long, so an arrow head fits. */
const STUB = 16;
/** Search area around the two ends. */
const SEARCH_MARGIN = 128;
/** Routes prefer to stay this far from shapes. */
const CLEARANCE = 16;

// Costs per lattice step (8 px).
/** A bend costs as much as 64 px of extra length. */
const BEND_PENALTY = 64 / STEP;
/** A step within CLEARANCE of a shape. */
const PROXIMITY_PENALTY = 0.5;
/** A step off the visible grid lines, so routes run between the dots when they can. */
const OFF_GRID_PENALTY = 0.1;

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
 * A* over lattice points. State is (point, direction of the last step), so
 * bends can be charged. Points on or inside a shape are blocked. Anchored
 * ends get a straight stub first, and the search runs between the stub
 * tips. Tries a small area around the ends first, then one that covers
 * every obstacle, so detours around large shapes are still found.
 */
function orthogonalRoute(a: RouteEnd, b: RouteEnd, obstacles: readonly Rect[]): Point[] | null {
  if (!onLattice(a.point) || !onLattice(b.point)) return null;

  const near = boundsAround([a.point, b.point], SEARCH_MARGIN);
  const wide = boundsAround(
    [a.point, b.point, ...obstacles.flatMap((r) => [r, { x: r.x + r.width, y: r.y + r.height }])],
    2 * STUB,
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
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minI: Math.floor((Math.min(...xs) - margin) / STEP),
    minJ: Math.floor((Math.min(...ys) - margin) / STEP),
    maxI: Math.ceil((Math.max(...xs) + margin) / STEP),
    maxJ: Math.ceil((Math.max(...ys) + margin) / STEP),
  };
}

/** The tip of the straight stub in front of an anchored end. Free ends have none. */
function stubTip(end: RouteEnd): Point {
  if (end.out === null) return end.point;
  const [dx, dy] = STEPS[end.out]!;
  return { x: end.point.x + dx * STUB, y: end.point.y + dy * STUB };
}

function search(a: RouteEnd, b: RouteEnd, obstacles: readonly Rect[], bounds: Bounds): Point[] | null {
  const { minI, minJ, maxI, maxJ } = bounds;
  const width = maxI - minI + 1;
  const height = maxJ - minJ + 1;
  const cells = width * height;
  const inside = (i: number, j: number) => i >= minI && i <= maxI && j >= minJ && j <= maxJ;
  const cell = (i: number, j: number) => (j - minJ) * width + (i - minI);

  const from0 = stubTip(a);
  const to0 = stubTip(b);
  const si = from0.x / STEP;
  const sj = from0.y / STEP;
  const ti = to0.x / STEP;
  const tj = to0.y / STEP;
  if (!inside(si, sj) || !inside(ti, tj)) return null;
  const start = cell(si, sj);
  const target = cell(ti, tj);

  const blocked = new Uint8Array(cells);
  for (const r of obstacles) {
    const i0 = Math.max(Math.ceil(r.x / STEP), minI);
    const i1 = Math.min(Math.floor((r.x + r.width) / STEP), maxI);
    const j0 = Math.max(Math.ceil(r.y / STEP), minJ);
    const j1 = Math.min(Math.floor((r.y + r.height) / STEP), maxJ);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[cell(i, j)] = 1;
  }
  // Free ends may sit anywhere. A stub tip inside another shape leaves no way out.
  if (a.out === null) blocked[start] = 0;
  if (b.out === null) blocked[target] = 0;
  if (blocked[start] || blocked[target]) return null;

  // Free points within CLEARANCE of a shape.
  const reach = CLEARANCE / STEP;
  const near = new Uint8Array(cells);
  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      if (!blocked[cell(i, j)]) continue;
      for (let dj = -reach; dj <= reach; dj++) {
        for (let di = -reach; di <= reach; di++) {
          if (inside(i + di, j + dj)) near[cell(i + di, j + dj)] = 1;
        }
      }
    }
  }

  const isFree = (p: Point) => {
    const i = p.x / STEP;
    const j = p.y / STEP;
    return Number.isInteger(i) && Number.isInteger(j) && inside(i, j) && !blocked[cell(i, j)];
  };

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

    // At the target's stub tip, any direction works except heading away from the target.
    if (c === target && (b.out === null || d !== b.out)) {
      const route = [a.point, ...toPolyline(state, from, width, minI, minJ), b.point];
      return centreZ(simplify(route), isFree);
    }

    for (let nd = 0 as Dir; nd < 4; nd = (nd + 1) as Dir) {
      if (nd === (d + 2) % 4) continue; // No U-turns on the spot.

      const [dx, dy] = STEPS[nd]!;
      const ni = i + dx;
      const nj = j + dy;
      if (!inside(ni, nj)) continue;
      const nc = cell(ni, nj);
      if (blocked[nc]) continue;

      // Running along a row or column that is not a visible grid line.
      const offGrid = (dx !== 0 ? nj * STEP : ni * STEP) % grid() !== 0;
      const next = nc * 4 + nd;
      const g =
        cost[state]! +
        1 +
        (nd === d ? 0 : BEND_PENALTY) +
        (near[nc] ? PROXIMITY_PENALTY : 0) +
        (offGrid ? OFF_GRID_PENALTY : 0);
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
    points.push({ x: ((c % width) + minI) * STEP, y: (Math.floor(c / width) + minJ) * STEP });
  }
  return points.reverse();
}

/**
 * A* picks any of several equally cheap Z routes, often with the middle
 * run right next to one end. This moves the middle run halfway between
 * the ends, onto a visible grid line, if both outer runs stay at least a
 * stub long and all points along the new route are free.
 */
function centreZ(points: Point[], isFree: (p: Point) => boolean): Point[] {
  if (points.length !== 4) return points;
  const [p0, p1, p2, p3] = points as [Point, Point, Point, Point];
  const keepsStubs = (start: number, mid: number, end: number, first: number, last: number) =>
    Math.sign(mid - start) === Math.sign(first - start) &&
    Math.sign(end - mid) === Math.sign(end - last) &&
    Math.abs(mid - start) >= STUB &&
    Math.abs(end - mid) >= STUB;

  let candidate: Point[];
  if (p0.y === p1.y && p2.y === p3.y) {
    const mid = snap((p0.x + p3.x) / 2, grid());
    if (!keepsStubs(p0.x, mid, p3.x, p1.x, p2.x)) return points;
    candidate = [p0, { x: mid, y: p0.y }, { x: mid, y: p3.y }, p3];
  } else if (p0.x === p1.x && p2.x === p3.x) {
    const mid = snap((p0.y + p3.y) / 2, grid());
    if (!keepsStubs(p0.y, mid, p3.y, p1.y, p2.y)) return points;
    candidate = [p0, { x: p0.x, y: mid }, { x: p3.x, y: mid }, p3];
  } else {
    return points;
  }

  return latticePointsAlong(candidate).every(isFree) ? candidate : points;
}

/** Lattice points along a polyline, without its two ends (they sit on shape borders). */
function latticePointsAlong(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / STEP;
    const sx = Math.sign(b.x - a.x) * STEP;
    const sy = Math.sign(b.y - a.y) * STEP;
    for (let s = 1; s <= steps; s++) out.push({ x: a.x + s * sx, y: a.y + s * sy });
  }
  out.pop();
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

function onLattice(p: Point): boolean {
  return p.x % STEP === 0 && p.y % STEP === 0;
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
