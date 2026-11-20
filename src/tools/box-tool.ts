import type { AppContext } from "../context";
import { MIN_SHAPE_SIZE, rectFromPoints, type Rect } from "../core/geometry";
import type { IconDef } from "../core/svg";
import { newId, type Patch } from "../model/diagram";
import { nextFrameName } from "../model/queries";
import type { Item } from "../model/types";
import { sizeReadout } from "../render/overlay";
import { textStyle } from "../render/theme";
import type { BoxKind } from "../selection/box";
import type { CanvasPointer } from "../ui/canvas";
import { GestureTool, type Gesture } from "./tool";

interface BoxToolConfig<C extends BoxKind> {
  readonly id: string;
  readonly label: string;
  readonly shortcut: string;
  readonly icon: IconDef;
  readonly kind: C;
  /** The new item for the dragged bounds. */
  create(id: string, bounds: Rect): Item<C>;
}

/**
 * Draws a box by dragging. Corners snap to the grid. Shift constrains to a
 * square. The item is real from the first move, so what you see while
 * dragging is the result. Drags below the minimum size are discarded,
 * a kept box ends up selected.
 */
export class BoxTool<C extends BoxKind> extends GestureTool {
  readonly id: string;
  readonly label: string;
  readonly shortcut: string;
  readonly icon: IconDef;
  readonly cursor = "crosshair";

  constructor(
    ctx: AppContext,
    private readonly config: BoxToolConfig<C>,
  ) {
    super(ctx);
    ({ id: this.id, label: this.label, shortcut: this.shortcut, icon: this.icon } = config);
  }

  protected begin({ point: start }: CanvasPointer): Gesture {
    const { diagram, canvas, selection } = this.ctx;
    const { kind, create } = this.config;
    const overlay = canvas.overlay();
    const id = newId();

    return {
      move: ({ point, event }) => {
        const bounds = rectFromPoints(start, point, event.shiftKey);
        // Every box kind extends Rect, which TypeScript cannot see through C.
        if (diagram.get(kind, id)) diagram.update(kind, id, bounds as Patch<C>);
        else diagram.add(kind, create(id, bounds));
        overlay.replaceChildren(sizeReadout(bounds));
      },
      end: () => {
        const box = diagram.get(kind, id);
        const kept = !!box && box.width >= MIN_SHAPE_SIZE && box.height >= MIN_SHAPE_SIZE;
        if (kept) selection.set({ kind, id });
        return kept;
      },
      dispose: () => overlay.remove(),
    };
  }
}

export function rectTool(ctx: AppContext): BoxTool<"shapes"> {
  return new BoxTool(ctx, {
    id: "rect",
    label: "Rectangle",
    shortcut: "r",
    // Lucide "square"
    icon: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }]],
    kind: "shapes",
    create: (id, bounds) => ({
      id,
      kind: "rect",
      ...bounds,
      text: "",
      align: "center",
      valign: "middle",
      fontSize: textStyle.defaultFontSize,
    }),
  });
}

export function frameTool(ctx: AppContext): BoxTool<"frames"> {
  return new BoxTool(ctx, {
    id: "frame",
    label: "Frame",
    shortcut: "f",
    // Lucide "frame"
    icon: [["path", { d: "M22 6H2M22 18H2M6 2v20M18 2v20" }]],
    kind: "frames",
    create: (id, bounds) => ({ id, ...bounds, name: nextFrameName(ctx.diagram.doc) }),
  });
}
