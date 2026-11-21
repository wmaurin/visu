import type { AppContext } from "../context";
import { rectFromPoints, type Rect } from "../core/geometry";
import type { IconDef } from "../core/svg";
import { newId, type Patch } from "../model/diagram";
import { settle } from "../model/hierarchy";
import { nextFrameName } from "../model/queries";
import type { Item } from "../model/types";
import { sizeReadout } from "../render/overlay";
import { textStyle } from "../render/theme";
import { sizeStep, type BoxKind } from "../selection/box";
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
 * Draws a box by dragging from a grid point. Width and height follow the
 * kind's size step. Shift constrains to a square. The item is real from
 * the first move, so what you see while dragging is the result. Drags
 * below one step are discarded, a kept box ends up selected.
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

    const step = sizeStep(kind);
    // Rounds to the size step, down to zero, so a tiny drag creates nothing.
    const toStep = (d: number) => Math.sign(d) * Math.round(Math.abs(d) / step) * step;

    return {
      move: ({ point, event }) => {
        const corner = { x: start.x + toStep(point.x - start.x), y: start.y + toStep(point.y - start.y) };
        const bounds = rectFromPoints(start, corner, event.shiftKey);
        overlay.replaceChildren(sizeReadout(bounds));
        if (bounds.width === 0 || bounds.height === 0) return;
        // Every box kind extends Rect, which TypeScript cannot see through C.
        if (diagram.get(kind, id)) diagram.update(kind, id, bounds as Patch<C>);
        else diagram.add(kind, create(id, bounds));
      },
      end: () => {
        const box = diagram.get(kind, id);
        const kept = !!box && box.width >= step && box.height >= step;
        if (!kept) return false;
        // A new rectangle joins what it was drawn in and adopts what it was drawn around.
        if (kind === "shapes") settle(diagram, { kind: "shapes", id });
        selection.set([{ kind, id }]);
        return true;
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
      bold: false,
      textColor: "black",
      // Black border on a white fill, as before colours existed.
      color: "black",
      saturation: 0,
      parentId: null,
    }),
  });
}

export function overlayTool(ctx: AppContext): BoxTool<"overlays"> {
  return new BoxTool(ctx, {
    id: "overlay",
    label: "Overlay",
    shortcut: "o",
    // Lucide "square-dashed"
    icon: [
      [
        "path",
        {
          d: "M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1",
        },
      ],
    ],
    kind: "overlays",
    // A light tint that lets the diagram show through.
    create: (id, bounds) => ({ id, ...bounds, color: "sky", saturation: 100, transparency: 90 }),
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
