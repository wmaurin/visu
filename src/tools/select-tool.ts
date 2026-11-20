import type { CanvasPointer } from "../canvas";
import { AnchorHints, findTarget } from "../connect";
import { FormatBar } from "../format-bar";
import { GRID, MIN_SHAPE_SIZE, type Point, type Rect } from "../geometry";
import { LineBar } from "../line-bar";
import { newId, type Endpoint, type LineShape, type Shape } from "../model";
import { pathData } from "../routing";
import { setAttrs, svgEl, type IconDef } from "../svg";
import { colours, font, ui } from "../theme";
import type { Tool, ToolContext } from "./tool";

/** Gap between a shape and its selection outline. */
const SELECTION_PADDING = 3;
/** Edge length of a resize handle. */
const HANDLE_SIZE = 8;
/** Extra grab margin around a handle, so it is easy to hit. */
const HANDLE_HIT_SLOP = 3;
/** How close to a line a click must be to select it. */
const LINE_HIT_TOLERANCE = 5;
/** Radius of the handles on the two ends of a selected line. */
const END_HANDLE_RADIUS = 5;

type HandleId = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";
type LineEnd = "from" | "to";

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

/** Moving or resizing a shape. */
interface ShapeDrag {
  readonly kind: "shape";
  readonly id: string;
  /** null moves the shape, otherwise the handle being dragged. */
  readonly handle: Handle | null;
  /** Shape bounds when the drag started. */
  readonly origin: Rect;
  /** Snapped pointer position when the drag started. */
  readonly start: Point;
}

/** Moving one end of a line to another anchor or grid point. */
interface EndDrag {
  readonly kind: "end";
  readonly id: string;
  readonly end: LineEnd;
  /** The endpoint when the drag started, restored on Escape. */
  readonly origin: Endpoint;
}

type Drag = ShapeDrag | EndDrag;

/**
 * Selects a shape by clicking it, moves it by dragging its body and resizes
 * it by dragging one of the eight handles. All changes happen in snapped
 * steps, so shapes stay on the grid. Escape aborts a running drag and
 * restores the previous state, otherwise it clears the selection.
 * Double-clicking a shape edits its text. While a shape is selected, a
 * floating bar sets its font size and text alignment.
 *
 * A selected line shows a handle on each end. Dragging one reconnects that
 * end to another anchor or a free grid point. A floating bar sets how the
 * line is routed.
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

  // Shape selection
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
  private readonly shapeSelection = svgEl("g", {}, [this.outline, ...this.handleEls.values()]);

  // Line selection
  private readonly lineHighlight = svgEl("path", {
    fill: "none",
    stroke: ui.selection,
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  private readonly endHandles: Record<LineEnd, SVGCircleElement> = {
    from: endHandle(),
    to: endHandle(),
  };
  private readonly lineSelection = svgEl("g", {}, [
    this.lineHighlight,
    this.endHandles.from,
    this.endHandles.to,
  ]);

  private readonly formatBar: FormatBar;
  private readonly lineBar: LineBar;
  private readonly hints: AnchorHints;

  constructor(private readonly ctx: ToolContext) {
    this.formatBar = new FormatBar(ctx.canvas, ctx.diagram);
    this.lineBar = new LineBar(ctx.canvas, ctx.diagram);
    this.hints = new AnchorHints(ctx.canvas);
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

    const shape = this.selectedShape();
    const handle = shape ? handleAt(shape, raw) : null;
    if (shape && handle) {
      this.drag = { kind: "shape", id: shape.id, handle, origin: boundsOf(shape), start: point };
      this.renderSelection();
      return;
    }

    // Line ends sit on shape borders, so they must win over the shape below.
    const line = this.selectedLine();
    const end = line ? this.endAt(line, raw) : null;
    if (line && end) {
      this.drag = { kind: "end", id: line.id, end, origin: line[end] };
      this.renderSelection();
      return;
    }

    // Shapes are drawn above lines, so they win the hit test.
    const hit = this.ctx.diagram.shapeAt(raw);
    if (hit) {
      this.select(hit.id);
      this.drag = { kind: "shape", id: hit.id, handle: null, origin: boundsOf(hit), start: point };
      return;
    }

    this.select(this.ctx.diagram.lineAt(raw, LINE_HIT_TOLERANCE)?.id ?? null);
  }

  pointerMove({ point, raw }: CanvasPointer): void {
    const drag = this.drag;
    if (!drag) {
      this.ctx.canvas.setCursor(this.hoverCursor(raw));
      return;
    }

    if (drag.kind === "end") {
      this.moveEnd(drag, point, raw);
      return;
    }

    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (drag.handle) {
      this.ctx.diagram.setBounds(drag.id, resizeBounds(drag.origin, drag.handle.id, dx, dy));
    } else {
      this.ctx.diagram.moveTo(drag.id, drag.origin.x + dx, drag.origin.y + dy);
    }
  }

  pointerUp(): void {
    this.drag = null;
    this.hints.clear();
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

  /**
   * Reconnects the dragged end to whatever is under the pointer. A target
   * on the other end's position is skipped, as it would collapse the line.
   */
  private moveEnd(drag: EndDrag, snapped: Point, raw: Point): void {
    const line = this.ctx.diagram.getLine(drag.id);
    if (!line) return;

    const target = findTarget(this.ctx.diagram, snapped, raw);
    this.hints.show(target);

    const other = this.ctx.diagram.resolve(drag.end === "from" ? line.to : line.from);
    if (other && other.x === target.point.x && other.y === target.point.y) return;
    this.ctx.diagram.updateLine(drag.id, { [drag.end]: target.end });
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
    // Works for shapes and lines. Lines attached to a removed shape go too.
    // The selection clears itself on the next render.
    this.ctx.diagram.remove(this.selectedId);
    return true;
  }

  private hoverCursor(p: Point): string {
    const shape = this.selectedShape();
    const handle = shape ? handleAt(shape, p) : null;
    if (handle) return handle.cursor;
    const line = this.selectedLine();
    if (line && this.endAt(line, p)) return "move";
    if (this.ctx.diagram.shapeAt(p)) return "move";
    return this.ctx.diagram.lineAt(p, LINE_HIT_TOLERANCE) ? "pointer" : this.cursor;
  }

  private revertDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.hints.clear();
    if (drag.kind === "shape") this.ctx.diagram.setBounds(drag.id, drag.origin);
    else this.ctx.diagram.updateLine(drag.id, { [drag.end]: drag.origin });
    this.renderSelection();
  }

  /** The end of the line whose handle is under the point, if any. */
  private endAt(line: LineShape, p: Point): LineEnd | null {
    const points = this.ctx.diagram.route(line);
    if (!points) return null;
    const reach = END_HANDLE_RADIUS + HANDLE_HIT_SLOP;
    const near = (q: Point) => Math.hypot(p.x - q.x, p.y - q.y) <= reach;
    if (near(points[0]!)) return "from";
    if (near(points[points.length - 1]!)) return "to";
    return null;
  }

  private selectedShape(): Shape | undefined {
    return this.selectedId ? this.ctx.diagram.get(this.selectedId) : undefined;
  }

  private selectedLine(): LineShape | undefined {
    return this.selectedId ? this.ctx.diagram.getLine(this.selectedId) : undefined;
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.renderSelection();
  }

  private renderSelection(): void {
    const shape = this.selectedShape();
    if (shape) {
      this.clearLineSelection();
      this.renderShapeSelection(shape);
      return;
    }

    this.clearShapeSelection();
    const line = this.selectedLine();
    const points = line ? this.ctx.diagram.route(line) : null;
    if (line && points) {
      this.renderLineSelection(line, points);
      return;
    }

    // The selected item no longer exists.
    this.selectedId = null;
    this.clearLineSelection();
  }

  private renderShapeSelection(shape: Shape): void {
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
    if (!this.shapeSelection.isConnected) {
      this.ctx.canvas.overlayLayer.append(this.shapeSelection);
    }

    // Size readout only while resizing, next to the bottom right corner.
    if (this.drag?.kind === "shape" && this.drag.handle) {
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

  private renderLineSelection(line: LineShape, points: readonly Point[]): void {
    setAttrs(this.lineHighlight, { d: pathData(points) });
    const first = points[0]!;
    const last = points[points.length - 1]!;
    setAttrs(this.endHandles.from, { cx: first.x, cy: first.y });
    setAttrs(this.endHandles.to, { cx: last.x, cy: last.y });
    if (!this.lineSelection.isConnected) this.ctx.canvas.overlayLayer.append(this.lineSelection);

    if (this.drag) this.lineBar.hide();
    else this.lineBar.show(line, points);
  }

  private clearShapeSelection(): void {
    this.shapeSelection.remove();
    this.readout.remove();
    this.formatBar.hide();
  }

  private clearLineSelection(): void {
    this.lineSelection.remove();
    this.lineBar.hide();
  }
}

function endHandle(): SVGCircleElement {
  return svgEl("circle", {
    r: END_HANDLE_RADIUS,
    fill: colours.paper,
    stroke: ui.selection,
    "stroke-width": 1.5,
  });
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
