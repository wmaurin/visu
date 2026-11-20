import type { CanvasPointer } from "../canvas";
import { GRID, rectFromPoints, type Point, type Rect } from "../geometry";
import { newId } from "../model";
import { setAttrs, svgEl, type IconDef } from "../svg";
import { colours, font, nodeStyle } from "../theme";
import type { Tool, ToolContext } from "./tool";

/** Smaller drags count as accidental clicks and create nothing. */
const MIN_SIZE = GRID;

interface Draft {
  readonly start: Point;
  readonly outline: SVGRectElement;
  readonly readout: SVGTextElement;
}

/**
 * Draws rectangles by dragging. Corners snap to the grid.
 * Shift constrains to a square, Escape aborts the current drag.
 */
export class RectTool implements Tool {
  readonly id = "rect";
  readonly label = "Rectangle";
  readonly shortcut = "r";
  readonly cursor = "crosshair";
  readonly icon: IconDef = [["rect", { x: 3, y: 5, width: 14, height: 10, rx: 1.5 }]];

  private draft: Draft | null = null;

  constructor(private readonly ctx: ToolContext) {}

  pointerDown({ point, event }: CanvasPointer): void {
    if (event.button !== 0 || this.draft) return;

    const outline = svgEl("rect", {
      ...nodeStyle,
      "fill-opacity": 0.6,
      "stroke-dasharray": "4 3",
    });
    const readout = svgEl("text", {
      "font-family": font.mono,
      "font-size": 11,
      fill: colours.muted,
    });
    this.ctx.canvas.overlayLayer.append(outline, readout);

    this.draft = { start: point, outline, readout };
    this.update(point, event.shiftKey);
  }

  pointerMove({ point, event }: CanvasPointer): void {
    if (this.draft) this.update(point, event.shiftKey);
  }

  pointerUp({ point, event }: CanvasPointer): void {
    if (!this.draft) return;

    const rect = rectFromPoints(this.draft.start, point, event.shiftKey);
    this.discard();

    if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
      this.ctx.diagram.add({ id: newId(), kind: "rect", ...rect });
    }
  }

  pointerCancel(): void {
    this.discard();
  }

  keyDown(event: KeyboardEvent): boolean {
    if (event.key === "Escape" && this.draft) {
      this.discard();
      return true;
    }
    return false;
  }

  deactivate(): void {
    this.discard();
  }

  private update(point: Point, square: boolean): void {
    if (!this.draft) return;
    const rect = rectFromPoints(this.draft.start, point, square);
    setAttrs(this.draft.outline, rectAttrs(rect));
    setAttrs(this.draft.readout, {
      x: rect.x + rect.width + 8,
      y: rect.y + rect.height + 16,
    });
    this.draft.readout.textContent = `${rect.width} × ${rect.height}`;
  }

  private discard(): void {
    this.draft?.outline.remove();
    this.draft?.readout.remove();
    this.draft = null;
  }
}

function rectAttrs({ x, y, width, height }: Rect) {
  return { x, y, width, height };
}
