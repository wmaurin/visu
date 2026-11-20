import type { Diagram } from "./diagram";
import { childBounds, layering, parentFor } from "./queries";
import type { ChildKind, Ref } from "./types";

/**
 * Keeps parent links in line with geometry. An item belongs to the
 * innermost rectangle that fully contains it.
 *
 * Called after an item was created, moved or resized. Rechecks the item,
 * its direct children (they leave when no longer inside) and its siblings
 * (they join when now inside it). All in one batch, so subscribers see a
 * single change.
 */
export function settle(diagram: Diagram, ref: Ref & { kind: ChildKind }): void {
  diagram.batch(() => {
    reparent(diagram, ref);

    const doc = diagram.doc;
    const item = diagram.get(ref.kind, ref.id);
    if (!item) return;

    const siblings: Ref[] = [
      ...doc.shapes.filter((s) => s.parentId === item.parentId).map((s) => ({ kind: "shapes" as const, id: s.id })),
      ...doc.texts.filter((t) => t.parentId === item.parentId).map((t) => ({ kind: "texts" as const, id: t.id })),
    ];
    const children = ref.kind === "shapes" ? (layering(doc).children.get(ref.id) ?? []) : [];

    for (const other of [...children, ...siblings]) {
      if (other.kind === ref.kind && other.id === ref.id) continue;
      reparent(diagram, other as Ref & { kind: ChildKind });
    }
  });
}

function reparent(diagram: Diagram, ref: Ref & { kind: ChildKind }): void {
  const item = diagram.get(ref.kind, ref.id);
  if (!item) return;
  const parentId = parentFor(diagram.doc, ref, childBounds(item), item.parentId);
  if (parentId !== item.parentId) diagram.update(ref.kind, ref.id, { parentId });
}
