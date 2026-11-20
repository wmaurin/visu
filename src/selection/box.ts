import type { AppContext } from "../context";
import { grid, inflate, type Point, type Rect } from "../core/geometry";
import type { Item } from "../model/types";
import { HANDLE_HIT_SLOP, HANDLE_SIZE, outline, SELECTION_PADDING, sizeReadout, squareHandle } from "../render/overlay";
import type { Gesture } from "../tools/tool";
import type { CanvasPointer } from "../ui/canvas";
import { within, type Handler } from "./handler";

/** Item kinds that are rectangles on the grid: moved, resized, snapped. */
export type BoxKind = "shapes" | "frames";

/**
 * Width and height are multiples of this step, which is also the minimum
 * size. Shapes use two grid steps, so their centre always lies on a grid
 * point and lines can attach there. Frames need no centre.
 */
export function sizeStep(kind: BoxKind): number {
  return kind === "shapes" ? 2 * grid() : grid();
}

/** A length rounded to the size step, never below one step. */
export function snapSize(length: number, step: number): number {
  return Math.max(step, Math.round(length / step) * step);
}

type HandleId = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";

interface ResizeHandle {
  readonly id: HandleId;
  /** Position along the outline, 0 = left/top, 1 = right/bottom. */
  readonly fx: 0 | 0.5 | 1;
  readonly fy: 0 | 0.5 | 1;
  readonly cursor: string;
}

/** Corners come first so they win when handles overlap on tiny boxes. */
const HANDLES: readonly ResizeHandle[] = [
  { id: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { id: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { id: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { id: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { id: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { id: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { id: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { id: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

/**
 * Shared handler parts for boxes: outline with eight resize handles, and
 * moving by dragging. Spread into a kind's handler.
 */
export function boxBehaviour<T extends Item<BoxKind>>(
  ctx: AppContext,
  kind: BoxKind,
): Required<Pick<Handler<T>, "bounds" | "overlay" | "handleAt" | "drag">> {
  return {
    bounds: (b) => b,

    overlay: (b) => [
      outline(inflate(b, SELECTION_PADDING), 6),
      ...HANDLES.map((h) => squareHandle(handleCentre(b, h))),
    ],

    handleAt: (b, p) => {
      const handle = HANDLES.find((h) => within(p, handleCentre(b, h), HANDLE_SIZE / 2 + HANDLE_HIT_SLOP));
      return handle ? { cursor: handle.cursor, begin: (start) => resize(ctx, kind, b, handle.id, start) } : null;
    },

    drag: (b, start) => ({
      move: ({ point }) =>
        ctx.diagram.update(kind, b.id, { x: b.x + point.x - start.point.x, y: b.y + point.y - start.point.y }),
    }),
  };
}

function handleCentre(r: Rect, h: ResizeHandle): Point {
  const box = inflate(r, SELECTION_PADDING);
  return { x: box.x + h.fx * box.width, y: box.y + h.fy * box.height };
}

function resize(ctx: AppContext, kind: BoxKind, origin: Item<BoxKind>, handle: HandleId, start: CanvasPointer): Gesture {
  const overlay = ctx.canvas.overlay();
  return {
    move: ({ point }) => {
      const delta = { x: point.x - start.point.x, y: point.y - start.point.y };
      const bounds = resizeBounds(origin, handle, delta, sizeStep(kind));
      ctx.diagram.update(kind, origin.id, bounds);
      overlay.replaceChildren(sizeReadout(bounds));
    },
    dispose: () => overlay.remove(),
  };
}

/**
 * Moves the edges named by the handle by the given delta. The opposite
 * edges stay fixed. The resulting size snaps to the size step, so a box
 * that started off the step gets onto it with its first resize.
 */
function resizeBounds(origin: Rect, handle: HandleId, delta: Point, step: number): Rect {
  let { x, y, width, height } = origin;

  if (handle.includes("w")) {
    width = snapSize(width - delta.x, step);
    x = origin.x + origin.width - width;
  }
  if (handle.includes("e")) width = snapSize(width + delta.x, step);
  if (handle.includes("n")) {
    height = snapSize(height - delta.y, step);
    y = origin.y + origin.height - height;
  }
  if (handle.includes("s")) height = snapSize(height + delta.y, step);

  return { x, y, width, height };
}
