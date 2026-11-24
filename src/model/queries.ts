import { containsPoint, grid, inflate, type Point, type Rect } from "../core/geometry";
import { anchorPoint, nearestAnchor, SIDE_OUT } from "../layout/anchors";
import { distanceToPolyline, pointAlong } from "../layout/path";
import { computeRoute, moveMiddle, type RouteEnd } from "../layout/routing";
import { tagBox, textWidth } from "../layout/text";
import type { Doc, Endpoint, ExportFrame, FreeText, LineLabel, LineShape, Ref, Routing, Shape } from "./types";

/**
 * Read-only questions about a document. Pure functions of the Doc, so
 * results can be cached per Doc version.
 */

/** How close to a line a click must be to hit it. */
const LINE_HIT_TOLERANCE = 5;
/** Export frame title: font size and height of its clickable area. */
export const FRAME_TITLE_SIZE = 11;
const FRAME_TITLE_HEIGHT = 20;

/**
 * Routes per document version and grid size. A new Doc starts with an
 * empty cache, and routes for another grid size never mix.
 */
const routes = new WeakMap<Doc, Map<string, Point[] | null>>();

export function byId<T extends { readonly id: string }>(items: readonly T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

/** Current position of an endpoint, or null if its shape is gone. */
export function resolve(doc: Doc, end: Endpoint): Point | null {
  if (end.kind === "free") return { x: end.x, y: end.y };
  const shape = byId(doc.shapes, end.shapeId);
  return shape ? anchorPoint(shape, end.side, end.offset) : null;
}

function routeEnd(doc: Doc, end: Endpoint): RouteEnd | null {
  const point = resolve(doc, end);
  return point && { point, out: end.kind === "anchor" ? SIDE_OUT[end.side] : null };
}

/**
 * Polyline between two ends. Only leaf rectangles are obstacles, so lines
 * may cross container borders to reach what is inside.
 */
export function routeBetween(doc: Doc, from: Endpoint, to: Endpoint, routing: Routing): Point[] | null {
  const a = routeEnd(doc, from);
  const b = routeEnd(doc, to);
  return a && b ? computeRoute(a, b, routing, layering(doc).leaves) : null;
}

// Hierarchy

export interface Layering {
  /** Rectangles with children, outermost first. Drawn below lines. */
  readonly containers: readonly Shape[];
  /** Rectangles without children, in document order. Drawn above lines. */
  readonly leaves: readonly Shape[];
  /** All rectangles from bottom to top: containers, then leaves. */
  readonly drawOrder: readonly Shape[];
  /** Direct children per rectangle id. */
  readonly children: ReadonlyMap<string, readonly Ref[]>;
}

const layerings = new WeakMap<Doc, Layering>();

/**
 * Splits rectangles into containers and leaves and orders them for drawing.
 * Cached per document version. A parent that does not exist counts as none.
 */
export function layering(doc: Doc): Layering {
  const cached = layerings.get(doc);
  if (cached) return cached;

  const ids = new Set(doc.shapes.map((s) => s.id));
  const children = new Map<string, Ref[]>();
  const adopt = (parentId: string | null, ref: Ref) => {
    if (parentId === null || !ids.has(parentId)) return;
    children.set(parentId, [...(children.get(parentId) ?? []), ref]);
  };
  for (const s of doc.shapes) adopt(s.parentId, { kind: "shapes", id: s.id });
  for (const t of doc.texts) adopt(t.parentId, { kind: "texts", id: t.id });

  const parentOf = new Map(doc.shapes.map((s) => [s.id, s.parentId]));
  const depth = (id: string) => {
    let d = 0;
    // Bounded, so a broken chain can never loop.
    for (let p = parentOf.get(id); p && ids.has(p) && d < ids.size; p = parentOf.get(p)) d += 1;
    return d;
  };

  const containers = doc.shapes.filter((s) => children.has(s.id)).sort((a, b) => depth(a.id) - depth(b.id));
  const leaves = doc.shapes.filter((s) => !children.has(s.id));
  const result: Layering = { containers, leaves, drawOrder: [...containers, ...leaves], children };
  layerings.set(doc, result);
  return result;
}

/** All items inside a rectangle, at any depth. */
export function descendants(doc: Doc, shapeId: string): Ref[] {
  const { children } = layering(doc);
  const found: Ref[] = [];
  const seen = new Set([shapeId]);
  for (let queue = [...(children.get(shapeId) ?? [])]; queue.length > 0; ) {
    const ref = queue.shift()!;
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    found.push(ref);
    if (ref.kind === "shapes") queue = [...queue, ...(children.get(ref.id) ?? [])];
  }
  return found;
}

/**
 * Lines with a dragged middle run whose anchored ends all sit on the given
 * rectangles. When those rectangles move together, the middle run moves too.
 */
export function bentLinesBetween(doc: Doc, shapeIds: ReadonlySet<string>): LineShape[] {
  return doc.lines.filter((l) => {
    const anchors = [l.from, l.to].filter((e) => e.kind === "anchor");
    return l.middle !== null && anchors.length > 0 && anchors.every((e) => shapeIds.has(e.shapeId));
  });
}

/** Area an item occupies, used to decide what it sits in. */
export function childBounds(item: Shape | FreeText): Rect {
  if ("width" in item) return item;
  return textBox(item) ?? { x: item.x, y: item.y, width: 0, height: 0 };
}

/**
 * The innermost rectangle that fully contains `bounds` and is larger,
 * skipping the item itself and its descendants so no cycle can form.
 *
 * The current parent wins every tie: an item stays where it is while its
 * parent still contains it and no smaller rectangle does. Without this,
 * an item covered by two equal rectangles, e.g. a pasted copy shifted
 * over its original, would jump to whichever comes first.
 */
export function parentFor(doc: Doc, ref: Ref, bounds: Rect, current: string | null = null): string | null {
  const excluded = new Set(ref.kind === "shapes" ? [ref.id, ...descendants(doc, ref.id).map((d) => d.id)] : []);
  const area = (r: Rect) => r.width * r.height;
  const fits = (s: Shape) => !excluded.has(s.id) && area(s) > area(bounds) && containsRect(s, bounds);

  let best: Shape | null = null;
  for (const s of doc.shapes) {
    if (fits(s) && (!best || area(s) < area(best))) best = s;
  }
  const parent = current === null ? undefined : byId(doc.shapes, current);
  if (parent && best && fits(parent) && area(parent) <= area(best)) return parent.id;
  return best?.id ?? null;
}

function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Everything that lies fully inside `area`, for selecting with a marquee.
 * Fully inside, not touching, so a marquee drawn within a container does
 * not pick the container as well.
 */
export function itemsInside(doc: Doc, area: Rect): Ref[] {
  const within = (box: Rect | null) => box !== null && containsRect(area, box);
  const refs = <K extends Ref["kind"]>(kind: K, items: ReadonlyArray<{ id: string }>, test: (i: never) => boolean) =>
    items.filter((item) => test(item as never)).map((item) => ({ kind, id: item.id }));

  return [
    ...refs("shapes", doc.shapes, (s: Shape) => within(s)),
    ...refs("lines", doc.lines, (l: LineShape) => {
      const points = route(doc, l);
      return points !== null && points.every((p) => containsPoint(area, p));
    }),
    ...refs("labels", doc.labels, (l: LineLabel) => within(labelBox(doc, l))),
    ...refs("texts", doc.texts, (t: FreeText) => within(textBox(t))),
    ...refs("frames", doc.frames, (f: ExportFrame) => within(f)),
  ];
}

/** The polyline a line is drawn along, or null if one of its shapes is gone. */
export function route(doc: Doc, line: LineShape): Point[] | null {
  let cache = routes.get(doc);
  if (!cache) routes.set(doc, (cache = new Map()));
  const key = `${grid()}:${line.id}`;
  let points = cache.get(key);
  if (points === undefined) {
    points = routeBetween(doc, line.from, line.to, line.routing);
    // A dragged middle run wins, as long as it still fits the route.
    if (points && line.middle && line.routing === "orthogonal") points = moveMiddle(points, line.middle) ?? points;
    cache.set(key, points);
  }
  return points;
}

/** Box of a label's tag, or null if it is empty or its line cannot be routed. */
export function labelBox(doc: Doc, label: LineLabel): Rect | null {
  const line = byId(doc.lines, label.lineId);
  const points = line && route(doc, line);
  if (!points || label.text === "") return null;
  return tagBox(pointAlong(points, label.t), label.text, label.fontSize);
}

/** Topmost rectangle under the point: a leaf before the innermost container. */
export function shapeAt(doc: Doc, p: Point, margin = 0): Shape | undefined {
  return layering(doc).drawOrder.findLast((s) => containsPoint(inflate(s, margin), p));
}

/** Leaf rectangle under the point. Containers are picked after lines. */
function leafAt(doc: Doc, p: Point): Shape | undefined {
  return layering(doc).leaves.findLast((s) => containsPoint(s, p));
}

/** Innermost container under the point. */
function containerAt(doc: Doc, p: Point): Shape | undefined {
  return layering(doc).containers.findLast((s) => containsPoint(s, p));
}

export function lineAt(doc: Doc, p: Point): LineShape | undefined {
  return doc.lines.findLast((line) => {
    const points = route(doc, line);
    return points !== null && distanceToPolyline(p, points) <= LINE_HIT_TOLERANCE;
  });
}

export function labelAt(doc: Doc, p: Point): LineLabel | undefined {
  return doc.labels.findLast((label) => {
    const box = labelBox(doc, label);
    return box !== null && containsPoint(box, p);
  });
}

/** Box of a free text's tag, or null while it is empty. */
export function textBox(text: FreeText): Rect | null {
  return text.text === "" ? null : tagBox(text, text.text, text.fontSize, text.align, text.valign);
}

export function textAt(doc: Doc, p: Point): FreeText | undefined {
  return doc.texts.findLast((t) => {
    const box = textBox(t);
    return box !== null && containsPoint(box, p);
  });
}

/** Area of the name above an export frame's top left corner. */
export function frameTitleBox(frame: ExportFrame): Rect {
  const width = textWidth(frame.name, FRAME_TITLE_SIZE);
  return { x: frame.x, y: frame.y - FRAME_TITLE_HEIGHT, width, height: FRAME_TITLE_HEIGHT };
}

/** "Frame" plus one more than the highest number in use, e.g. "Frame3". */
export function nextFrameName(doc: Doc): string {
  const numbers = doc.frames.map((f) => /^Frame(\d+)$/.exec(f.name)?.[1]).map(Number);
  return `Frame${Math.max(0, ...numbers.filter(Number.isInteger)) + 1}`;
}

/** True when `p` lies on the border of `r`, within the line hit tolerance. */
function onBorder(r: Rect, p: Point): boolean {
  return containsPoint(inflate(r, LINE_HIT_TOLERANCE), p) && !containsPoint(inflate(r, -LINE_HIT_TOLERANCE), p);
}

/**
 * Export frame whose border or title is under the point. Its inside stays
 * free, so items within the frame remain clickable.
 */
export function frameAt(doc: Doc, p: Point): ExportFrame | undefined {
  return doc.frames.findLast((f) => onBorder(f, p) || containsPoint(frameTitleBox(f), p));
}

/**
 * The item under the point, in drawing order from the top: texts, labels,
 * leaf rectangles, lines, containers (innermost first), frames.
 */
export function pick(doc: Doc, p: Point): Ref | null {
  const text = textAt(doc, p);
  if (text) return { kind: "texts", id: text.id };
  const label = labelAt(doc, p);
  if (label) return { kind: "labels", id: label.id };
  const leaf = leafAt(doc, p);
  if (leaf) return { kind: "shapes", id: leaf.id };
  const line = lineAt(doc, p);
  if (line) return { kind: "lines", id: line.id };
  const container = containerAt(doc, p);
  if (container) return { kind: "shapes", id: container.id };
  const frame = frameAt(doc, p);
  return frame ? { kind: "frames", id: frame.id } : null;
}

/** Where a line end would go for the pointer position. */
export interface Target {
  readonly end: Endpoint;
  readonly point: Point;
  /** The shape the end attaches to, if any. */
  readonly shape: Shape | undefined;
}

/** Anchor on the shape under the pointer, otherwise a free grid point. */
export function connectionTarget(doc: Doc, snapped: Point, raw: Point): Target {
  // Anchors still catch the pointer half a grid step outside the shape.
  const shape = shapeAt(doc, raw, grid() / 2);
  if (!shape) return { end: { kind: "free", x: snapped.x, y: snapped.y }, point: snapped, shape };
  const end: Endpoint = { kind: "anchor", shapeId: shape.id, ...nearestAnchor(shape, raw) };
  return { end, point: resolve(doc, end)!, shape };
}
