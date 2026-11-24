import type { Diagram } from "./diagram";
import { settle } from "./hierarchy";
import { bentLinesBetween, descendants } from "./queries";
import type { Collection, Ref, Selection } from "./types";

/** Kinds that move together when several items are moved. Lines follow their anchors. */
type Movable = "shapes" | "texts" | "frames";
const MOVABLE: ReadonlySet<Collection> = new Set<Movable>(["shapes", "texts", "frames"]);

export interface Move {
  /** Places every item at its start position plus the offset. */
  to(dx: number, dy: number): void;
  /** Rechecks parents once the items have come to rest. */
  settle(): void;
}

/**
 * Moves selected rectangles, texts and frames by the same
 * distance, rectangles with everything inside them. Each item counts
 * once, also when it is selected and inside a selected container.
 * Offsets are relative to where the items were when the move began.
 */
export function moveItems(diagram: Diagram, selected: Selection): Move {
  const moving = new Map<string, { kind: Movable; x: number; y: number }>();
  const take = (ref: Ref) => {
    if (!MOVABLE.has(ref.kind)) return;
    const kind = ref.kind as Movable;
    const item = diagram.get(kind, ref.id);
    if (item) moving.set(ref.id, { kind, x: item.x, y: item.y });
  };
  for (const ref of selected) {
    take(ref);
    if (ref.kind === "shapes") descendants(diagram.doc, ref.id).forEach(take);
  }
  // Lines running only between moving rectangles keep their dragged middle run in step.
  const shapeIds = new Set([...moving].filter(([, m]) => m.kind === "shapes").map(([id]) => id));
  const bent = bentLinesBetween(diagram.doc, shapeIds);

  return {
    to: (dx, dy) =>
      diagram.batch(() => {
        for (const [id, { kind, x, y }] of moving) diagram.update(kind, id, { x: x + dx, y: y + dy });
        for (const l of bent) diagram.update("lines", l.id, { middle: { x: l.middle!.x + dx, y: l.middle!.y + dy } });
      }),
    // Moved items may now sit in, or around, other rectangles.
    settle: () =>
      diagram.batch(() => {
        for (const { kind, id } of selected) {
          if (kind === "shapes" || kind === "texts") settle(diagram, { kind, id });
        }
      }),
  };
}
