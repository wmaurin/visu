import type { Diagram } from "./diagram";
import { newId } from "./diagram";
import { settle } from "./hierarchy";
import { descendants } from "./queries";
import type { Doc, Endpoint, FreeText, LineLabel, LineShape, Ref, Selection, Shape } from "./types";

/**
 * A copied part of the diagram: rectangles with everything inside them,
 * free texts, and the lines that run only between copied rectangles,
 * with their labels. A snapshot, so later edits to the originals do not
 * change it.
 */
export interface Clip {
  readonly shapes: readonly Shape[];
  readonly texts: readonly FreeText[];
  readonly lines: readonly LineShape[];
  readonly labels: readonly LineLabel[];
}

/** What the selection copies, or null when it holds nothing copyable. */
export function copyItems(doc: Doc, selection: Selection): Clip | null {
  const shapeIds = new Set<string>();
  const textIds = new Set<string>();
  const take = (ref: Ref) => (ref.kind === "shapes" ? shapeIds : textIds).add(ref.id);

  for (const ref of selection) {
    if (ref.kind !== "shapes" && ref.kind !== "texts") continue;
    take(ref);
    if (ref.kind === "shapes") descendants(doc, ref.id).forEach(take);
  }
  if (shapeIds.size === 0 && textIds.size === 0) return null;

  // A line comes along when it is attached, and only to copied rectangles.
  const copied = (e: Endpoint) => e.kind === "free" || shapeIds.has(e.shapeId);
  const lines = doc.lines.filter(
    (l) => (l.from.kind === "anchor" || l.to.kind === "anchor") && copied(l.from) && copied(l.to),
  );
  const lineIds = new Set(lines.map((l) => l.id));

  return {
    shapes: doc.shapes.filter((s) => shapeIds.has(s.id)),
    texts: doc.texts.filter((t) => textIds.has(t.id)),
    lines,
    labels: doc.labels.filter((l) => lineIds.has(l.lineId)),
  };
}

/**
 * Adds a copy of the clip, shifted by `offset`. Every item gets a new id
 * and references follow. Returns the top level items of the copy, the
 * ones to select.
 */
export function pasteClip(diagram: Diagram, clip: Clip, offset: number): Ref[] {
  const ids = new Map<string, string>();
  const fresh = (id: string) => {
    const next = newId();
    ids.set(id, next);
    return next;
  };
  [...clip.shapes, ...clip.texts, ...clip.lines, ...clip.labels].forEach((item) => fresh(item.id));
  const id = (old: string) => ids.get(old)!;
  // Parents outside the copy are dropped. settle() finds the new place.
  const parent = (old: string | null) => (old !== null && ids.has(old) ? id(old) : null);
  const end = (e: Endpoint): Endpoint =>
    e.kind === "anchor" ? { ...e, shapeId: id(e.shapeId) } : { ...e, x: e.x + offset, y: e.y + offset };

  const topLevel: Ref[] = [];
  diagram.batch(() => {
    for (const s of clip.shapes) {
      diagram.add("shapes", { ...s, id: id(s.id), x: s.x + offset, y: s.y + offset, parentId: parent(s.parentId) });
    }
    for (const t of clip.texts) {
      diagram.add("texts", { ...t, id: id(t.id), x: t.x + offset, y: t.y + offset, parentId: parent(t.parentId) });
    }
    for (const l of clip.lines) {
      const middle = l.middle && { x: l.middle.x + offset, y: l.middle.y + offset };
      diagram.add("lines", { ...l, id: id(l.id), from: end(l.from), to: end(l.to), middle });
    }
    for (const l of clip.labels) diagram.add("labels", { ...l, id: id(l.id), lineId: id(l.lineId) });

    for (const item of [...clip.shapes, ...clip.texts]) {
      if (parent(item.parentId) !== null) continue;
      const ref = { kind: "width" in item ? "shapes" : "texts", id: id(item.id) } as const;
      settle(diagram, ref);
      topLevel.push(ref);
    }
  });
  return topLevel;
}
