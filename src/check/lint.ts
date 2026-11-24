import { inflate, type Point, type Rect } from "../core/geometry";
import { ValidationError } from "../core/validate";
import { textWidth, wrapText } from "../layout/text";
import { childBounds, labelBox, layering, parentFor, resolve, route, textBox } from "../model/queries";
import type { Doc, Endpoint, FreeText, Ref, Shape } from "../model/types";
import { parseProject } from "../project/format";
import { lineHeightFor, textStyle } from "../render/theme";

/**
 * Checks a project file for problems a reader would notice: it does not
 * load, lines cross boxes or run on top of each other, text overflows or
 * collides, items sit outside the export frame. Runs without a browser,
 * so text widths are estimated and may differ a little from the editor.
 */

export interface Finding {
  readonly level: "error" | "warning";
  /** The item concerned, e.g. "lines[api-db]", or "file". */
  readonly where: string;
  readonly message: string;
}

/** The router's lattice. Positions off it are not routed around shapes. */
const LATTICE = 8;
/** Shared runs shorter than this are only touching, e.g. at a corner. */
const MIN_OVERLAP = LATTICE;
/** A label this close to a bend looks like it sits on the corner. */
const BEND_CLEARANCE = 4;
/** Space kept above and below middle aligned text. */
const MIDDLE_AIR = 4;

export function lint(text: string): Finding[] {
  let doc: Doc;
  try {
    doc = parseProject(text).doc;
  } catch (e) {
    if (e instanceof ValidationError) return [{ level: "error", where: "file", message: e.message }];
    throw e;
  }

  const findings: Finding[] = [];
  const warn = (where: string, message: string) => findings.push({ level: "warning", where, message });

  checkLattice(doc, warn);
  checkParents(doc, warn);
  checkShapes(doc, warn);
  checkLines(doc, warn);
  checkTexts(doc, warn);
  checkFrames(doc, warn);
  return findings;
}

/** Every line's computed route and its length, to place labels by `t`. */
export function routes(text: string): Array<{ id: string; length: number; points: Point[] }> {
  const doc = parseProject(text).doc;
  return doc.lines.flatMap((l) => {
    const points = route(doc, l);
    if (!points) return [];
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    return [{ id: l.id, length, points }];
  });
}

type Warn = (where: string, message: string) => void;

const at = (kind: string, id: string) => `${kind}[${id}]`;

function onLattice(v: number): boolean {
  return v % LATTICE === 0;
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function strictlyInside(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
}

function endName(end: Endpoint): string {
  return end.kind === "anchor" ? `${end.shapeId}.${end.side}` : `(${end.x}, ${end.y})`;
}

/** Shapes and line ends belong on the lattice, or the router falls back to a plain elbow. */
function checkLattice(doc: Doc, warn: Warn): void {
  for (const s of doc.shapes) {
    const off = (["x", "y", "width", "height"] as const).filter((k) => !onLattice(s[k]));
    if (off.length > 0) warn(at("shapes", s.id), `${off.join(", ")} not a multiple of ${LATTICE}`);
  }
  for (const l of doc.lines) {
    if (l.routing !== "orthogonal") continue;
    for (const key of ["from", "to"] as const) {
      const p = resolve(doc, l[key]);
      if (p && !(onLattice(p.x) && onLattice(p.y))) {
        warn(at("lines", l.id), `${key} end ${endName(l[key])} at (${p.x}, ${p.y}) is off the ${LATTICE} px lattice, so the route ignores shapes`);
      }
    }
  }
}

/** A given parentId must match what the editor derives from the geometry. */
function checkParents(doc: Doc, warn: Warn): void {
  const items: Array<[Ref, Shape | FreeText]> = [
    ...doc.shapes.map((s): [Ref, Shape] => [{ kind: "shapes", id: s.id }, s]),
    ...doc.texts.map((t): [Ref, FreeText] => [{ kind: "texts", id: t.id }, t]),
  ];
  for (const [ref, item] of items) {
    const expected = parentFor(doc, ref, childBounds(item), item.parentId);
    if (expected !== item.parentId) {
      warn(at(ref.kind, ref.id), `parentId is ${item.parentId ?? "null"} but it lies in ${expected ?? "no rectangle"}`);
    }
  }
}

/** Rectangles side by side must not overlap. Text must fit. A container's title must clear its children. */
function checkShapes(doc: Doc, warn: Warn): void {
  for (let i = 0; i < doc.shapes.length; i++) {
    for (let j = i + 1; j < doc.shapes.length; j++) {
      const a = doc.shapes[i]!;
      const b = doc.shapes[j]!;
      if (a.parentId === b.parentId && overlap(a, b)) warn(at("shapes", a.id), `overlaps shapes[${b.id}]`);
    }
  }

  const { children } = layering(doc);
  for (const s of doc.shapes) {
    if (s.text === "") continue;
    const block = textBlock(s);
    if (block.brokenWord) warn(at("shapes", s.id), `a word is wider than the box and breaks mid word`);
    // Middle aligned text ignores the padding, so only keep a little air.
    const room = s.height - (s.valign === "middle" ? 2 * MIDDLE_AIR : 2 * textStyle.padding);
    if (block.rect.height > room) {
      warn(at("shapes", s.id), `text needs about ${Math.ceil(block.rect.height + s.height - room)} px of height, has ${s.height}`);
    }
    for (const child of children.get(s.id) ?? []) {
      const item = child.kind === "shapes" ? doc.shapes.find((c) => c.id === child.id) : doc.texts.find((c) => c.id === child.id);
      if (item && overlap(block.rect, childBounds(item))) warn(at("shapes", s.id), `text overlaps its child ${at(child.kind, child.id)}`);
    }
  }
}

/** Where a rectangle's text lands, as the renderer lays it out. */
function textBlock(s: Shape): { rect: Rect; brokenWord: boolean } {
  const { padding } = textStyle;
  const maxWidth = Math.max(1, s.width - 2 * padding);
  const lines = wrapText(s.text, maxWidth, s.fontSize, s.bold);
  const words = s.text.split(/\s+/).filter((w) => w !== "");
  const brokenWord = words.some((w) => wrapText(w, maxWidth, s.fontSize, s.bold).length > 1);
  const height = lines.length * lineHeightFor(s.fontSize);
  const width = Math.min(maxWidth, Math.max(...lines.map((l) => textWidth(l, s.fontSize, s.bold))));
  const y = { top: s.y + padding, middle: s.y + (s.height - height) / 2, bottom: s.y + s.height - padding - height }[s.valign];
  const x = { left: s.x + padding, center: s.x + (s.width - width) / 2, right: s.x + s.width - padding - width }[s.align];
  return { rect: { x, y, width, height }, brokenWord };
}

interface Segment {
  readonly lineId: string;
  readonly a: Point;
  readonly b: Point;
}

/** Lines must not cross boxes, share a track with other lines, or cross each other. Labels must sit clear. */
function checkLines(doc: Doc, warn: Warn): void {
  const { leaves } = layering(doc);
  const segments: Segment[] = [];

  for (const l of doc.lines) {
    const points = route(doc, l);
    if (!points) continue;
    for (let i = 1; i < points.length; i++) segments.push({ lineId: l.id, a: points[i - 1]!, b: points[i]! });

    const crossed = new Set<string>();
    for (let i = 1; i < points.length; i++) {
      for (const p of samples(points[i - 1]!, points[i]!)) {
        for (const s of leaves) if (strictlyInside(p, s)) crossed.add(s.id);
      }
    }
    for (const id of crossed) warn(at("lines", l.id), `crosses shapes[${id}]`);
  }

  const ends = new Map(doc.lines.map((l) => [l.id, [resolve(doc, l.from), resolve(doc, l.to)]]));
  const shareEnd = (x: string, y: string) =>
    ends.get(x)!.some((p) => p && ends.get(y)!.some((q) => q && p.x === q.x && p.y === q.y));

  const reported = new Set<string>();
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i]!;
      const t = segments[j]!;
      if (s.lineId === t.lineId) continue;
      const key = `${s.lineId}\u0000${t.lineId}`;
      if (reported.has(key)) continue;
      if (sharedRun(s, t) >= MIN_OVERLAP && !shareEnd(s.lineId, t.lineId)) {
        reported.add(key);
        warn(at("lines", s.lineId), `runs on top of lines[${t.lineId}]`);
      } else if (crosses(s, t)) {
        reported.add(key);
        warn(at("lines", s.lineId), `crosses lines[${t.lineId}]`);
      }
    }
  }

  const boxes = doc.labels.flatMap((l) => {
    const box = labelBox(doc, l);
    const line = doc.lines.find((x) => x.id === l.lineId);
    const points = line ? (route(doc, line) ?? []) : [];
    return box ? [{ id: l.id, box, bends: points.slice(1, -1) }] : [];
  });
  const { containers } = layering(doc);
  for (const [i, { id, box, bends }] of boxes.entries()) {
    for (const s of leaves) if (overlap(box, s)) warn(at("labels", id), `overlaps shapes[${s.id}]`);
    for (const s of containers) {
      if (overlap(box, s) && !inside(box, s)) warn(at("labels", id), `cuts across the border of shapes[${s.id}]`);
    }
    if (bends.some((p) => inside({ ...p, width: 0, height: 0 }, inflate(box, BEND_CLEARANCE)))) {
      warn(at("labels", id), "sits on a bend, move it onto a straight run");
    }
    for (const other of boxes.slice(i + 1)) if (overlap(box, other.box)) warn(at("labels", id), `overlaps labels[${other.id}]`);
    for (const t of doc.texts) {
      const tb = textBox(t);
      if (tb && overlap(box, tb)) warn(at("labels", id), `overlaps texts[${t.id}]`);
    }
  }
}

/** Points every 2 px along a segment, ends included. */
function samples(a: Point, b: Point): Point[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/** Length two collinear axis-parallel segments share, 0 otherwise. */
function sharedRun(s: Segment, t: Segment): number {
  const vertical = (g: Segment) => g.a.x === g.b.x;
  const horizontal = (g: Segment) => g.a.y === g.b.y;
  const span = (u: number, v: number, p: number, q: number) =>
    Math.min(Math.max(u, v), Math.max(p, q)) - Math.max(Math.min(u, v), Math.min(p, q));
  if (vertical(s) && vertical(t) && s.a.x === t.a.x) return Math.max(0, span(s.a.y, s.b.y, t.a.y, t.b.y));
  if (horizontal(s) && horizontal(t) && s.a.y === t.a.y) return Math.max(0, span(s.a.x, s.b.x, t.a.x, t.b.x));
  return 0;
}

/** True when the segments cross at a point inside both, not where one ends. */
function crosses(s: Segment, t: Segment): boolean {
  const d = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(t.a, t.b, s.a);
  const d2 = d(t.a, t.b, s.b);
  const d3 = d(s.a, s.b, t.a);
  const d4 = d(s.a, s.b, t.b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Free text must not cut across a rectangle's border. */
function checkTexts(doc: Doc, warn: Warn): void {
  for (const t of doc.texts) {
    const box = textBox(t);
    if (!box) continue;
    for (const s of doc.shapes) {
      if (overlap(box, s) && !inside(box, s)) warn(at("texts", t.id), `cuts across the border of shapes[${s.id}]`);
    }
  }
}

/** Everything belongs inside an export frame, or the export cuts it off. */
function checkFrames(doc: Doc, warn: Warn): void {
  if (doc.frames.length === 0) {
    warn("file", "no export frame, add one around the diagram");
    return;
  }
  const framed = (r: Rect) => doc.frames.some((f) => inside(r, f));
  for (const s of doc.shapes) if (!framed(s)) warn(at("shapes", s.id), "outside every export frame");
  for (const t of doc.texts) {
    const box = textBox(t);
    if (box && !framed(box)) warn(at("texts", t.id), "outside every export frame");
  }
  for (const l of doc.labels) {
    const box = labelBox(doc, l);
    if (box && !framed(box)) warn(at("labels", l.id), "outside every export frame");
  }
  for (const l of doc.lines) {
    const points = route(doc, l);
    if (points && !points.every((p) => doc.frames.some((f) => inside({ ...p, width: 0, height: 0 }, f)))) {
      warn(at("lines", l.id), "leaves every export frame");
    }
  }
}
