import { FormatBar } from "../format-bar";
import type { CanvasPointer } from "../canvas";
import { GRID, MIN_SHAPE_SIZE, type Point, type Rect } from "../geometry";
import { newId, type Shape } from "../model";
import { setAttrs, svgEl, type IconDef } from "../svg";
import { colours, font, ui } from "../theme";
import type { Tool, ToolContext } from "./tool";

/** Gap between a shape and its selection outline. */
const SELECTION_PADDING = 3;
/** Edge length of a resize handle. */
const HANDLE_SIZE = 8;
/** Extra grab margin around a handle, so it is easy to hit. */
const HANDLE_HIT_SLOP = 3;

type HandleId = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";

interface Handle {
  readonly id: HandleId;
  /** Position along the outline, 0 = left/top, 1 = right/bottom. */
  readonly fx: 0 | 0.5 | 1;
  readonly fy: 0 | 0.5 | 1;
  readonly cursor: string;
}

/** Corners come first so they win when handles overlap on tiny shapes. */
const HANDLES: readonly Handle[] = [
  { id: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { id: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { id: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { id: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { id: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { id: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { id: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { id: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

interface Drag {
  readonly id: string;
  /** null moves the shape, otherwise the handle being dragged. */
  readonly handle: Handle | null;
  /** Shape bounds when the drag started. */
  readonly origin: Rect;
  /** Snapped pointer position when the drag started. */
  readonly start: Point;
}

/**
 * Selects a shape by clicking it, moves it by dragging its body and resizes
 * it by dragging one of the eight handles. All changes happen in snapped
 * steps, so shapes stay on the grid. Escape aborts a running drag and
 * restores the shape, otherwise it clears the selection.
 * Double-clicking a shape edits its text. While a shape is selected, a
 * floating bar sets its font size and text alignment.
 *
 * Keyboard: Delete/Backspace removes the selection, Ctrl/Cmd+C copies it
 * and Ctrl/Cmd+V pastes it. The clipboard is internal to the app on purpose,
 * so foreign clipboard content is never read or parsed.
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
  /** Snapshot taken on copy. Later edits to the original do not affect it. */
  private clipboard: Shape | null = null;
  /** Pastes since the last copy. Each one lands one grid step further. */
  private pasteCount = 0;
  private unsubscribe: (() => void) | null = null;

  private readonly outline = svgEl("rect", {
    fill: "none",
    stroke: ui.selection,
    "stroke-width": 1,
    rx: 6,
  });
  private readonly handleEls = new Map<HandleId, SVGRectElement>(
    HANDLES.map((h) => [
      h.id,
      svgEl("rect", {
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        rx: 2,
        fill: colours.paper,
        stroke: ui.selection,
        "stroke-width": 1,
      }),
    ]),
  );
  private readonly readout = svgEl("text", {
    "font-family": font.mono,
    "font-size": 11,
    fill: colours.muted,
  });
  private readonly selectionGroup = svgEl("g", {}, [this.outline, ...this.handleEls.values()]);
  private readonly formatBar: FormatBar;

  constructor(private readonly ctx: ToolContext) {
    this.formatBar = new FormatBar(ctx.canvas, ctx.diagram);
  }

  activate(): void {
    this.unsubscribe ??= this.ctx.diagram.subscribe(() => this.renderSelection());
  }

  deactivate(): void {
    this.ctx.textEditor.close();
    this.revertDrag();
    this.select(null);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  pointerDown({ point, raw, event }: CanvasPointer): void {
    if (event.button !== 0) return;

    const selected = this.selectedShape();
    const handle = selected ? handleAt(selected, raw) : null;
    if (selected && handle) {
      this.drag = { id: selected.id, handle, origin: boundsOf(selected), start: point };
      this.renderSelection();
      return;
    }

    const hit = this.ctx.diagram.shapeAt(raw);
    this.select(hit?.id ?? null);
    if (hit) {
      this.drag = { id: hit.id, handle: null, origin: boundsOf(hit), start: point };
    }
  }

  pointerMove({ point, raw }: CanvasPointer): void {
    if (!this.drag) {
      this.ctx.canvas.setCursor(this.hoverCursor(raw));
      return;
    }

    const { id, handle, origin, start } = this.drag;
    const dx = point.x - start.x;
    const dy = point.y - start.y;

    if (handle) {
      this.ctx.diagram.setBounds(id, resizeBounds(origin, handle.id, dx, dy));
    } else {
      this.ctx.diagram.moveTo(id, origin.x + dx, origin.y + dy);
    }
  }

  pointerUp(): void {
    this.drag = null;
    this.renderSelection();
  }

  pointerCancel(): void {
    this.revertDrag();
  }

  doubleClick({ raw }: CanvasPointer): void {
    const hit = this.ctx.diagram.shapeAt(raw);
    if (!hit) return;
    this.drag = null;
    this.select(hit.id);
    this.ctx.textEditor.open(hit.id);
  }

  keyDown(event: KeyboardEvent): boolean {
    if (event.key === "Escape") {
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

    // No clipboard or delete actions in the middle of a drag.
    if (this.drag) return false;

    const command = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
    const key = event.key.toLowerCase();

    if (command && key === "c") return this.copy();
    if (command && key === "v") return this.paste();
    if (!command && (event.key === "Delete" || event.key === "Backspace")) return this.deleteSelected();
    return false;
  }

  private copy(): boolean {
    const shape = this.selectedShape();
    if (!shape) return false;
    this.clipboard = { ...shape };
    this.pasteCount = 0;
    return true;
  }

  private paste(): boolean {
    if (!this.clipboard) return false;
    this.pasteCount += 1;
    const offset = this.pasteCount * GRID;
    const id = newId();
    this.ctx.diagram.add({
      ...this.clipboard,
      id,
      x: this.clipboard.x + offset,
      y: this.clipboard.y + offset,
    });
    this.select(id);
    return true;
  }

  private deleteSelected(): boolean {
    if (!this.selectedId) return false;
    // Removing the shape also clears the selection on the next render.
    this.ctx.diagram.remove(this.selectedId);
    return true;
  }

  private hoverCursor(p: Point): string {
    const selected = this.selectedShape();
    const handle = selected ? handleAt(selected, p) : null;
    if (handle) return handle.cursor;
    return this.ctx.diagram.shapeAt(p) ? "move" : this.cursor;
  }

  private revertDrag(): void {
    if (!this.drag) return;
    const { id, origin } = this.drag;
    this.drag = null;
    this.ctx.diagram.setBounds(id, origin);
    this.renderSelection();
  }

  private selectedShape() {
    return this.selectedId ? this.ctx.diagram.get(this.selectedId) : undefined;
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.renderSelection();
  }

  private renderSelection(): void {
    const shape = this.selectedShape();
    if (!shape) {
      this.selectedId = null;
      this.selectionGroup.remove();
      this.readout.remove();
      this.formatBar.hide();
      return;
    }

    // The bar would only get in the way while dragging.
    if (this.drag) this.formatBar.hide();
    else this.formatBar.show(shape);

    const box = outlineBox(shape);
    setAttrs(this.outline, { ...box });
    for (const handle of HANDLES) {
      const c = handleCentre(shape, handle);
      setAttrs(this.handleEls.get(handle.id)!, {
        x: c.x - HANDLE_SIZE / 2,
        y: c.y - HANDLE_SIZE / 2,
      });
    }
    if (!this.selectionGroup.isConnected) {
      this.ctx.canvas.overlayLayer.append(this.selectionGroup);
    }

    // Size readout only while resizing, next to the bottom right corner.
    if (this.drag?.handle) {
      setAttrs(this.readout, {
        x: box.x + box.width + 8,
        y: box.y + box.height + 16,
      });
      this.readout.textContent = `${shape.width} × ${shape.height}`;
      if (!this.readout.isConnected) this.ctx.canvas.overlayLayer.append(this.readout);
    } else {
      this.readout.remove();
    }
  }
}

function boundsOf({ x, y, width, height }: Rect): Rect {
  return { x, y, width, height };
}

function outlineBox(r: Rect): Rect {
  return {
    x: r.x - SELECTION_PADDING,
    y: r.y - SELECTION_PADDING,
    width: r.width + 2 * SELECTION_PADDING,
    height: r.height + 2 * SELECTION_PADDING,
  };
}

function handleCentre(r: Rect, h: Handle): Point {
  const box = outlineBox(r);
  return { x: box.x + h.fx * box.width, y: box.y + h.fy * box.height };
}

function handleAt(r: Rect, p: Point): Handle | null {
  const reach = HANDLE_SIZE / 2 + HANDLE_HIT_SLOP;
  return (
    HANDLES.find((h) => {
      const c = handleCentre(r, h);
      return Math.abs(p.x - c.x) <= reach && Math.abs(p.y - c.y) <= reach;
    }) ?? null
  );
}

/**
 * Moves the edges named by the handle by the given delta. The opposite
 * edges stay fixed and the shape never shrinks below MIN_SHAPE_SIZE.
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
