import { containsPoint, GRID, inflate, type Point, type Rect } from "../core/geometry";
import { anchorPoint, nearestAnchor, SIDE_OUT } from "../layout/anchors";
import { distanceToPolyline, pointAlong } from "../layout/path";
import { computeRoute, type RouteEnd } from "../layout/routing";
import { tagBox } from "../layout/text";
import type { Doc, Endpoint, FreeText, LineLabel, LineShape, Ref, Routing, Shape } from "./types";

/**
 * Read-only questions about a document. Pure functions of the Doc, so
 * results can be cached per Doc version.
 */

/** How close to a line a click must be to hit it. */
const LINE_HIT_TOLERANCE = 5;
/** How far outside a shape its anchors still catch the pointer. */
const CATCH_MARGIN = GRID / 2;

/** Routes per document version. A new Doc starts with an empty cache. */
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

/** Polyline between two ends. Every shape is an obstacle. */
export function routeBetween(doc: Doc, from: Endpoint, to: Endpoint, routing: Routing): Point[] | null {
  const a = routeEnd(doc, from);
  const b = routeEnd(doc, to);
  return a && b ? computeRoute(a, b, routing, doc.shapes) : null;
}

/** The polyline a line is drawn along, or null if one of its shapes is gone. */
export function route(doc: Doc, line: LineShape): Point[] | null {
  let cache = routes.get(doc);
  if (!cache) routes.set(doc, (cache = new Map()));
  let points = cache.get(line.id);
  if (points === undefined) {
    points = routeBetween(doc, line.from, line.to, line.routing);
    cache.set(line.id, points);
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

/** Topmost shape under the point, i.e. the last one drawn. */
export function shapeAt(doc: Doc, p: Point, margin = 0): Shape | undefined {
  return doc.shapes.findLast((s) => containsPoint(inflate(s, margin), p));
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

/** The item under the point, in drawing order from the top: texts, labels, shapes, lines. */
export function pick(doc: Doc, p: Point): Ref | null {
  const text = textAt(doc, p);
  if (text) return { kind: "texts", id: text.id };
  const label = labelAt(doc, p);
  if (label) return { kind: "labels", id: label.id };
  const shape = shapeAt(doc, p);
  if (shape) return { kind: "shapes", id: shape.id };
  const line = lineAt(doc, p);
  return line ? { kind: "lines", id: line.id } : null;
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
  const shape = shapeAt(doc, raw, CATCH_MARGIN);
  if (!shape) return { end: { kind: "free", x: snapped.x, y: snapped.y }, point: snapped, shape };
  const end: Endpoint = { kind: "anchor", shapeId: shape.id, ...nearestAnchor(shape, raw) };
  return { end, point: resolve(doc, end)!, shape };
}
