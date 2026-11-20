import type { CanvasPointer } from "../canvas";
import type { Point } from "../geometry";
import { setAttrs, svgEl, type IconDef } from "../svg";
import { ui } from "../theme";
import type { Tool, ToolContext } from "./tool";

/** Gap between a shape and its selection outline. */
const SELECTION_PADDING = 3;

interface Drag {
  readonly id: string;
  /** Shape position when the drag started. */
  readonly origin: Point;
  /** Snapped pointer position when the drag started. */
  readonly start: Point;
}

/**
 * Selects a shape by clicking it and moves it by dragging. The shape moves
 * in snapped steps, so it stays on the grid. Escape aborts a running drag
 * and puts the shape back, otherwise it clears the selection.
 */
export class SelectTool implements Tool {
  readonly id = "select";
  readonly label = "Select";
  readonly shortcut = "v";
  readonly cursor = "default";
  // Lucide "mouse-pointer-2"
  readonly icon: IconDef = [
    [
      "path",
      {
        d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",
      },
    ],
  ];

  private selectedId: string | null = null;
  private drag: Drag | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly outline = svgEl("rect", {
    fill: "none",
    stroke: ui.selection,
    "stroke-width": 1,
    rx: 6,
  });

  constructor(private readonly ctx: ToolContext) {}

  activate(): void {
    this.unsubscribe ??= this.ctx.diagram.subscribe(() => this.renderSelection());
  }

  deactivate(): void {
    this.revertDrag();
    this.select(null);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  pointerDown({ point, raw, event }: CanvasPointer): void {
    if (event.button !== 0) return;

    const hit = this.ctx.diagram.shapeAt(raw);
    this.select(hit?.id ?? null);
    if (hit) {
      this.drag = { id: hit.id, origin: { x: hit.x, y: hit.y }, start: point };
    }
  }

  pointerMove({ point, raw }: CanvasPointer): void {
    if (!this.drag) {
      this.ctx.canvas.setCursor(this.ctx.diagram.shapeAt(raw) ? "move" : this.cursor);
      return;
    }

    const { id, origin, start } = this.drag;
    this.ctx.diagram.moveTo(id, origin.x + point.x - start.x, origin.y + point.y - start.y);
  }

  pointerUp(): void {
    this.drag = null;
  }

  pointerCancel(): void {
    this.revertDrag();
  }

  keyDown(event: KeyboardEvent): boolean {
    if (event.key !== "Escape") return false;

    if (this.drag) {
      this.revertDrag();
      return true;
    }
    if (this.selectedId) {
      this.select(null);
      return true;
    }
    return false;
  }

  private revertDrag(): void {
    if (!this.drag) return;
    const { id, origin } = this.drag;
    this.drag = null;
    this.ctx.diagram.moveTo(id, origin.x, origin.y);
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.renderSelection();
  }

  private renderSelection(): void {
    const shape = this.selectedId ? this.ctx.diagram.get(this.selectedId) : undefined;
    if (!shape) {
      this.selectedId = null;
      this.outline.remove();
      return;
    }

    setAttrs(this.outline, {
      x: shape.x - SELECTION_PADDING,
      y: shape.y - SELECTION_PADDING,
      width: shape.width + 2 * SELECTION_PADDING,
      height: shape.height + 2 * SELECTION_PADDING,
    });
    if (!this.outline.isConnected) this.ctx.canvas.overlayLayer.append(this.outline);
  }
}
