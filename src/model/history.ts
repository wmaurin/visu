import type { Diagram } from "./diagram";
import type { Collection, Doc } from "./types";

/** Undo steps kept. Docs share unchanged items, so a step costs little. */
const LIMIT = 200;

/**
 * Undo and redo over whole document snapshots (Memento). The Diagram is
 * immutable, so a step is just the Doc before it.
 *
 * Changes that belong together become one step:
 * - Everything in the same task, e.g. a text created and opened for editing.
 * - Everything while held, e.g. a drag from pointer down to pointer up or
 *   an inline edit from open to close.
 * - Everything while a form field has focus, e.g. typing a size digit by
 *   digit or dragging a slider. The step ends with `change` or `focusout`.
 *
 * A change that leaves the document as it was, such as a cancelled drag,
 * records nothing.
 */
export class History {
  private readonly past: Doc[] = [];
  private readonly future: Doc[] = [];
  /** The document as of the last step. */
  private committed: Doc;
  private holds = 0;
  private restoring = false;
  private scheduled = false;

  constructor(private readonly diagram: Diagram) {
    this.committed = diagram.doc;
    diagram.subscribe(() => {
      if (!this.restoring) this.schedule();
    });
    // Form fields end their step when they are left or confirmed.
    document.addEventListener("change", () => this.schedule(), true);
    document.addEventListener("focusout", () => this.schedule(), true);
  }

  /** Groups every change until the matching `release` into one step. */
  hold(): void {
    this.holds += 1;
  }

  release(): void {
    this.holds = Math.max(0, this.holds - 1);
    this.schedule();
  }

  /** Steps back. Returns false when there is nothing to undo or a change is still open. */
  undo(): boolean {
    if (this.holds > 0) return false;
    this.commit();
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.committed);
    this.apply(previous);
    return true;
  }

  redo(): boolean {
    if (this.holds > 0) return false;
    this.commit();
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.committed);
    this.apply(next);
    return true;
  }

  /** Forgets every step, e.g. after a project was imported. */
  reset(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.committed = this.diagram.doc;
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.holds === 0 && !fieldFocused()) this.commit();
    });
  }

  /**
   * Ends the open step now, also while a form field still has focus.
   * Called before a gesture, so it never merges with an earlier change.
   */
  checkpoint(): void {
    if (this.holds === 0) this.commit();
  }

  /** Records the changes since the last step as a new step. */
  private commit(): void {
    const doc = this.diagram.doc;
    if (sameDoc(doc, this.committed)) {
      // Keeps the identical copy, so later comparisons stay cheap.
      this.committed = doc;
      return;
    }
    this.past.push(this.committed);
    if (this.past.length > LIMIT) this.past.shift();
    this.future.length = 0;
    this.committed = doc;
  }

  private apply(doc: Doc): void {
    this.committed = doc;
    this.restoring = true;
    try {
      this.diagram.restore(doc);
    } finally {
      this.restoring = false;
    }
  }
}

/**
 * True when both hold the same items. Items are immutable and replaced on
 * change, so identity is enough.
 */
function sameDoc(a: Doc, b: Doc): boolean {
  if (a === b) return true;
  return (Object.keys(a) as Collection[]).every((kind) => {
    const x = a[kind];
    const y = b[kind];
    return x.length === y.length && x.every((item, i) => item === y[i]);
  });
}

function fieldFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}
