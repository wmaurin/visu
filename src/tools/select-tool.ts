import type { AppContext } from "../context";
import type { IconDef } from "../core/svg";
import { pick } from "../model/queries";
import type { AnyItem, Collection, Ref } from "../model/types";
import type { Handler } from "../selection/handler";
import { frameHandler } from "../selection/frame";
import { labelHandler } from "../selection/label";
import { lineHandler } from "../selection/line";
import { shapeHandler } from "../selection/shape";
import { textHandler } from "../selection/text";
import type { CanvasPointer } from "../ui/canvas";
import { GestureTool, type Gesture } from "./tool";

/**
 * Selects, drags and edits items. Generic over item kinds: everything
 * kind specific (handles, drags, bars, double-click) lives in the handlers.
 *
 * Hit order: handles of the selected item, then texts, labels, shapes,
 * lines and the borders of export frames.
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
      frames: frameHandler(ctx),
    };
    ctx.diagram.subscribe(() => this.render());
    ctx.selection.subscribe(() => this.render());
  }

  deactivate(): void {
    super.deactivate();
    this.ctx.editor.close();
    this.ctx.selection.set(null);
  }

  protected begin(p: CanvasPointer): Gesture | null {
    const selected = this.selected();
    const handle = selected?.handler.handleAt?.(selected.item, p.raw);
    if (handle) return handle.begin(p);

    const ref = pick(this.ctx.diagram.doc, p.raw);
    this.ctx.selection.set(ref);
    const target = this.resolve(ref);
    return target?.handler.drag?.(target.item, p) ?? null;
  }

  protected hover({ raw }: CanvasPointer): void {
    const selected = this.selected();
    const handle = selected?.handler.handleAt?.(selected.item, raw);
    const ref = pick(this.ctx.diagram.doc, raw);
    this.ctx.canvas.setCursor(handle?.cursor ?? (ref ? this.handlers[ref.kind].cursor : this.cursor));
  }

  protected settled(): void {
    this.render();
  }

  doubleClick(p: CanvasPointer): void {
    const ref = pick(this.ctx.diagram.doc, p.raw);
    this.ctx.selection.set(ref);
    const target = this.resolve(ref);
    target?.handler.doubleClick?.(target.item, p);
  }

  private selected() {
    return this.resolve(this.ctx.selection.get());
  }

  private resolve(ref: Ref | null): { handler: Handler<AnyItem>; item: AnyItem } | null {
    const item = ref && this.ctx.diagram.get(ref.kind, ref.id);
    return ref && item ? { handler: this.handlers[ref.kind], item } : null;
  }

  /** Rebuilds the selection feedback. The bar hides while dragging. */
  private render(): void {
    const selected = this.selected();
    for (const handler of Object.values(this.handlers)) {
      if (handler !== selected?.handler) handler.bar?.hide();
    }
    if (!selected) {
      this.overlay.replaceChildren();
      return;
    }

    const { handler, item } = selected;
    this.overlay.replaceChildren(...handler.overlay(item));
    const box = handler.bounds(item);
    if (box && !this.busy) handler.bar?.show(item, box);
    else handler.bar?.hide();
  }
}
