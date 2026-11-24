import type { AppContext } from "../context";
import type { IconDef } from "../core/svg";
import type { Doc } from "../model/types";
import type { CanvasPointer } from "../ui/canvas";

export interface Tool {
  readonly id: string;
  readonly label: string;
  /** Single lower case key that activates the tool. */
  readonly shortcut: string;
  readonly icon: IconDef;
  readonly cursor: string;

  activate?(): void;
  /** Must discard any unfinished interaction. */
  deactivate?(): void;

  pointerDown?(p: CanvasPointer): void;
  pointerMove?(p: CanvasPointer): void;
  pointerUp?(p: CanvasPointer): void;
  doubleClick?(p: CanvasPointer): void;
  /** Aborts a running interaction. Returns true if there was one. */
  cancel?(): boolean;
}

/**
 * One drag interaction, from pointer down to pointer up (State pattern).
 * A gesture edits the document directly. Cancelling restores the snapshot
 * taken before it began, so gestures need no undo logic of their own.
 * A kept gesture is one undo step.
 */
export interface Gesture {
  move(p: CanvasPointer): void;
  /** Return false to discard the gesture's changes. */
  end?(p: CanvasPointer): boolean | void;
  /** Always called last, kept or discarded. Clears gesture overlays. */
  dispose?(): void;
}

/** Base for tools that work by dragging. Owns the gesture lifecycle. */
export abstract class GestureTool implements Tool {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly shortcut: string;
  abstract readonly icon: IconDef;
  abstract readonly cursor: string;

  private gesture: Gesture | null = null;
  private snapshot: Doc | null = null;

  constructor(protected readonly ctx: AppContext) {}

  /** Starts a gesture for a primary button press, or returns null. */
  protected abstract begin(p: CanvasPointer): Gesture | null;

  /** Pointer movement without a gesture, e.g. for hover feedback. */
  protected hover(_p: CanvasPointer): void {}

  /** Called after every gesture, kept or discarded. */
  protected settled(): void {}

  protected get busy(): boolean {
    return this.gesture !== null;
  }

  pointerDown(p: CanvasPointer): void {
    if (p.event.button !== 0 || this.gesture) return;
    this.ctx.history.checkpoint();
    const snapshot = this.ctx.diagram.doc;
    this.ctx.history.hold();
    const gesture = this.begin(p);
    if (!gesture) {
      this.ctx.history.release();
      return;
    }
    this.snapshot = snapshot;
    this.gesture = gesture;
  }

  pointerMove(p: CanvasPointer): void {
    if (this.gesture) this.gesture.move(p);
    else this.hover(p);
  }

  pointerUp(p: CanvasPointer): void {
    if (this.gesture) this.finish(this.gesture.end?.(p) !== false);
  }

  cancel(): boolean {
    if (!this.gesture) return false;
    this.finish(false);
    return true;
  }

  deactivate(): void {
    this.cancel();
  }

  private finish(keep: boolean): void {
    const { gesture, snapshot } = this;
    this.gesture = null;
    this.snapshot = null;
    gesture?.dispose?.();
    if (!keep && snapshot) this.ctx.diagram.restore(snapshot);
    this.ctx.history.release();
    this.settled();
  }
}
