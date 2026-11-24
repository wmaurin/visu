import { svgEl } from "../core/svg";
import type { Diagram } from "../model/diagram";
import type { History } from "../model/history";
import type { Ref } from "../model/types";
import type { Canvas } from "./canvas";

/**
 * What an item kind provides to be edited in place (Strategy). The editor
 * owns the lifecycle, the spec knows the item.
 */
export interface FieldSpec {
  /** Enter inserts a newline and Ctrl/Cmd+Enter finishes. Otherwise Enter finishes. */
  readonly multiline: boolean;
  /** Current text of the item, or undefined when it is gone. */
  text(): string | undefined;
  /** Builds the editing UI. `field` is the focusable element inside `root`. */
  create(text: string): { root: HTMLElement; field: HTMLElement };
  /** Places the frame over the item, or returns false when the item is gone. */
  layout(frame: SVGForeignObjectElement, root: HTMLElement, field: HTMLElement): boolean;
  commit(text: string): void;
}

interface Session {
  readonly ref: Ref;
  readonly spec: FieldSpec;
  readonly frame: SVGForeignObjectElement;
  readonly root: HTMLElement;
  readonly field: HTMLElement;
  readonly unsubscribe: () => void;
}

/**
 * Edits the text of one item at a time, in place. The field sits in the
 * overlay layer as a foreignObject, so it follows the viewport transform.
 * Text is read as plain text and rendered via textContent, so pasted
 * markup is never interpreted.
 *
 * Editing ends on blur, Escape or Enter (see FieldSpec.multiline).
 * A whole session is one undo step.
 */
export class InlineEditor {
  private session: Session | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly diagram: Diagram,
    private readonly history: History,
    private readonly onChange: () => void,
  ) {}

  /** The item being edited. Its rendered text is hidden meanwhile. */
  get editing(): Ref | null {
    return this.session?.ref ?? null;
  }

  /** True when the event target belongs to the open editor. */
  owns(target: EventTarget | null): boolean {
    return target instanceof Node && !!this.session?.frame.contains(target);
  }

  open(ref: Ref, spec: FieldSpec): void {
    this.close();
    const text = spec.text();
    if (text === undefined) return;

    const { root, field } = spec.create(text);
    const frame = svgEl("foreignObject", { "pointer-events": "auto" });
    frame.style.overflow = "visible";
    frame.append(root);
    this.canvas.overlayLayer.append(frame);

    field.addEventListener("keydown", (event) => {
      // Keys typed into the editor must not reach the shortcuts.
      event.stopPropagation();
      const enter = event.key === "Enter" && (!spec.multiline || event.ctrlKey || event.metaKey);
      if (event.key === "Escape" || enter) {
        event.preventDefault();
        this.close();
      }
    });
    field.addEventListener("input", () => this.layout());
    field.addEventListener("blur", () => this.close());

    this.history.hold();
    const unsubscribe = this.diagram.subscribe(() => this.layout());
    this.session = { ref, spec, frame, root, field, unsubscribe };
    this.layout();
    this.onChange();
    focusAtEnd(field);
  }

  close(): void {
    const session = this.session;
    if (!session) return;
    // Cleared first, so a blur fired by the removal cannot re-enter.
    this.session = null;

    session.unsubscribe();
    const text = readText(session.field);
    session.frame.remove();
    session.spec.commit(text);
    this.history.release();
    this.onChange();
  }

  private layout(): void {
    const s = this.session;
    if (s && !s.spec.layout(s.frame, s.root, s.field)) this.close();
  }
}

/** Prefers plaintext-only. Falls back where a browser does not support it. */
export function makePlainTextEditable(el: HTMLElement): void {
  try {
    el.contentEditable = "plaintext-only";
  } catch {
    el.contentEditable = "true";
    el.addEventListener("paste", (event) => {
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") ?? "");
    });
  }
}

export function focusAtEnd(field: HTMLElement): void {
  field.focus();
  if (field instanceof HTMLInputElement) {
    field.select();
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(field);
  // When only a placeholder <br> is present, the caret belongs before it.
  // After it, the caret would land on a second, empty line.
  range.collapse(field.textContent === "");
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function readText(field: HTMLElement): string {
  return field instanceof HTMLInputElement ? field.value.trim() : field.innerText.replace(/\n$/, "");
}
