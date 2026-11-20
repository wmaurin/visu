import type { AppContext } from "../context";
import { inflate, MIN_SHAPE_SIZE, type Point, type Rect } from "../core/geometry";
import type { Item } from "../model/types";
import { HANDLE_HIT_SLOP, HANDLE_SIZE, outline, SELECTION_PADDING, sizeReadout, squareHandle } from "../render/overlay";
import type { Gesture } from "../tools/tool";
import type { CanvasPointer } from "../ui/canvas";
import { within, type Handler } from "./handler";

/** Item kinds that are rectangles on the grid: moved, resized, snapped. */
export type BoxKind = "shapes" | "frames";

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
      const bounds = resizeBounds(origin, handle, point.x - start.point.x, point.y - start.point.y);
      ctx.diagram.update(kind, origin.id, bounds);
      overlay.replaceChildren(sizeReadout(bounds));
    },
    dispose: () => overlay.remove(),
  };
}

/**
 * Moves the edges named by the handle by the given delta. The opposite
 * edges stay fixed and the box never shrinks below MIN_SHAPE_SIZE.
 */
function resizeBounds(origin: Rect, handle: HandleId, dx: number, dy: number): Rect {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;

  if (handle.includes("w")) left = Math.min(left + dx, right - MIN_SHAPE_SIZE);
  if (handle.includes("e")) right = Math.max(right + dx, left + MIN_SHAPE_SIZE);
  if (handle.includes("n")) top = Math.min(top + dy, bottom - MIN_SHAPE_SIZE);
  if (handle.includes("s")) bottom = Math.max(bottom + dy, top + MIN_SHAPE_SIZE);

  return { x: left, y: top, width: right - left, height: bottom - top };
}
