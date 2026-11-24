import type { AppContext } from "../context";
import { rectFromPoints } from "../core/geometry";
import { svgEl, type IconDef } from "../core/svg";
import { moveItems } from "../model/move";
import { itemsInside, pick, route } from "../model/queries";
import {
  includesRef,
  sameRef,
  type AnyItem,
  type Collection,
  type LineShape,
  type Ref,
  type Selection,
} from "../model/types";
import { highlight, selectionOutline } from "../render/overlay";
import { ui } from "../render/theme";
import { frameHandler } from "../selection/frame";
import type { Handler } from "../selection/handler";
import { labelHandler } from "../selection/label";
import { lineHandler } from "../selection/line";
import { overlayHandler } from "../selection/overlay";
import { shapeHandler } from "../selection/shape";
import { textHandler } from "../selection/text";
import type { CanvasPointer } from "../ui/canvas";
import { GestureTool, type Gesture } from "./tool";

interface Resolved {
  readonly ref: Ref;
  readonly handler: Handler<AnyItem>;
  readonly item: AnyItem;
}

/**
 * Selects, drags and edits items. Generic over item kinds: everything
 * kind specific (handles, drags, bars, double-click) lives in the handlers.
 *
 * - Click selects one item, Ctrl/Cmd+click adds or removes one.
 * - Dragging on empty canvas draws a marquee and selects what lies fully
 *   inside, with Ctrl/Cmd adding to the selection.
 * - Dragging a selected item moves all selected items.
 * - A single selected item shows its handles and format bar.
 *
 * Hit order: handles of a single selected item, then overlay borders,
 * texts, labels, shapes, lines and the borders of export frames.
 */
export class SelectTool extends GestureTool {
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

  private readonly overlay: SVGGElement;
  private readonly handlers: Record<Collection, Handler<AnyItem>>;

  constructor(ctx: AppContext) {
    super(ctx);
    this.overlay = ctx.canvas.overlay();
    this.handlers = {
      shapes: shapeHandler(ctx),
      lines: lineHandler(ctx),
      labels: labelHandler(ctx),
      texts: textHandler(ctx),
      overlays: overlayHandler(ctx),
      frames: frameHandler(ctx),
    };
    ctx.diagram.subscribe(() => this.render());
    ctx.selection.subscribe(() => this.render());
    // The format bars are HTML on top of the canvas and follow pan and zoom.
    ctx.canvas.subscribe(() => this.render());
  }

  deactivate(): void {
    super.deactivate();
    this.ctx.editor.close();
    this.ctx.selection.set([]);
  }

  protected begin(p: CanvasPointer): Gesture | null {
    const { selection, diagram } = this.ctx;
    const additive = p.event.ctrlKey || p.event.metaKey;

    const single = this.single();
    const handle = !additive && single?.handler.handleAt?.(single.item, p.raw);
    if (handle) return handle.begin(p);

    const ref = pick(diagram.doc, p.raw);
    if (!ref) {
      if (!additive) selection.set([]);
      return this.marquee(p, additive ? selection.get() : []);
    }
    if (additive) {
      const current = selection.get();
      selection.set(includesRef(current, ref) ? current.filter((r) => !sameRef(r, ref)) : [...current, ref]);
      return null;
    }

    // A press on an unselected item selects it alone. On a selected one the selection stays.
    if (!includesRef(selection.get(), ref)) selection.set([ref]);
    const selected = selection.get();
    if (selected.length > 1) return this.moveTogether(p, selected);
    const target = this.resolve(ref);
    return target?.handler.drag?.(target.item, p) ?? null;
  }

  protected hover({ raw }: CanvasPointer): void {
    const single = this.single();
    const handle = single?.handler.handleAt?.(single.item, raw);
    const ref = pick(this.ctx.diagram.doc, raw);
    this.ctx.canvas.setCursor(handle?.cursor ?? (ref ? this.handlers[ref.kind].cursor : this.cursor));
  }

  protected settled(): void {
    this.render();
  }

  doubleClick(p: CanvasPointer): void {
    const ref = pick(this.ctx.diagram.doc, p.raw);
    if (!ref) return;
    this.ctx.selection.set([ref]);
    const target = this.resolve(ref);
    target?.handler.doubleClick?.(target.item, p);
  }

  /**
   * Draws a selection rectangle from the press point. Selects what lies
   * fully inside, added to `base`. Works on raw positions, as selecting
   * needs no snapping.
   */
  private marquee(start: CanvasPointer, base: Selection): Gesture {
    const { canvas, diagram, selection } = this.ctx;
    const overlay = canvas.overlay();
    return {
      move: ({ raw }) => {
        const area = rectFromPoints(start.raw, raw);
        overlay.replaceChildren(
          svgEl("rect", {
            ...area,
            fill: ui.selection,
            "fill-opacity": 0.06,
            stroke: ui.selection,
            "stroke-width": 1,
            "vector-effect": "non-scaling-stroke",
          }),
        );
        const inside = itemsInside(diagram.doc, area).filter((ref) => !includesRef(base, ref));
        selection.set([...base, ...inside]);
      },
      dispose: () => overlay.remove(),
    };
  }

  /** Moves all selected items by the same snapped distance. */
  private moveTogether(start: CanvasPointer, selected: Selection): Gesture {
    const move = moveItems(this.ctx.diagram, selected);
    return {
      move: ({ point }) => move.to(point.x - start.point.x, point.y - start.point.y),
      end: () => move.settle(),
    };
  }

  /** The selected item when exactly one is selected. */
  private single(): Resolved | null {
    const selected = this.ctx.selection.get();
    return selected.length === 1 ? this.resolve(selected[0]!) : null;
  }

  private resolve(ref: Ref): Resolved | null {
    const item = this.ctx.diagram.get(ref.kind, ref.id);
    return item ? { ref, handler: this.handlers[ref.kind], item } : null;
  }

  /**
   * Rebuilds the selection feedback. One item shows its handles and format
   * bar, the bar hidden while dragging. Several items show an outline each.
   */
  private render(): void {
    const resolved = this.ctx.selection.get().flatMap((ref) => this.resolve(ref) ?? []);
    const single = resolved.length === 1 ? resolved[0]! : null;

    for (const handler of Object.values(this.handlers)) {
      if (handler !== single?.handler) handler.bar?.hide();
    }

    if (single) {
      const { handler, item } = single;
      this.overlay.replaceChildren(...handler.overlay(item));
      const box = handler.bounds(item);
      if (box && !this.busy) handler.bar?.show(item, box);
      else handler.bar?.hide();
      return;
    }

    this.overlay.replaceChildren(...resolved.flatMap((r) => this.outlineOf(r)));
  }

  /** Light selection mark for one of several selected items. */
  private outlineOf({ ref, handler, item }: Resolved): SVGElement[] {
    if (ref.kind === "lines") {
      const points = route(this.ctx.diagram.doc, item as LineShape);
      return points ? [highlight(points)] : [];
    }
    const box = handler.bounds(item);
    return box ? [selectionOutline(box)] : [];
  }
}
