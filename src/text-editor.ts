import type { Canvas } from "./canvas";
import type { Diagram, HAlign, VAlign } from "./model";
import { svgEl } from "./svg";
import { cssFont, lineHeightFor, textStyle } from "./theme";

const JUSTIFY: Record<VAlign, string> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

const TEXT_ALIGN: Record<HAlign, string> = {
  left: "left",
  center: "center",
  right: "right",
};

interface Session {
  readonly id: string;
  readonly frame: SVGForeignObjectElement;
  readonly box: HTMLDivElement;
  readonly content: HTMLDivElement;
  readonly unsubscribe: () => void;
}

/**
 * In-place text editor for a shape. It sits in the overlay layer as a
 * foreignObject, so it follows the viewport transform like the shape does.
 * Content is plain text only. It is read via innerText and rendered via
 * textContent, so pasted markup is never interpreted.
 *
 * Editing ends on blur, Escape or Ctrl/Cmd+Enter. Enter inserts a newline.
 */
export class TextEditor {
  private session: Session | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly diagram: Diagram,
    private readonly onChange: () => void,
  ) {}

  get editingId(): string | null {
    return this.session?.id ?? null;
  }

  /** True when the event target belongs to the open editor. */
  owns(target: EventTarget | null): boolean {
    return target instanceof Node && !!this.session?.frame.contains(target);
  }

  open(id: string): void {
    this.close();
    const shape = this.diagram.get(id);
    if (!shape) return;

    const content = document.createElement("div");
    content.className = "text-editor-content";
    setPlainTextEditable(content);
    content.spellcheck = false;
    content.textContent = shape.text;
    // An empty editable has no line box, so the caret ignores text-align
    // until the first character arrives. A placeholder <br> creates the line.
    // innerText reads it as a trailing newline, which close() strips.
    if (shape.text === "") content.append(document.createElement("br"));
    content.style.color = textStyle.fill;

    const box = document.createElement("div");
    box.className = "text-editor";
    box.style.padding = `${textStyle.padding}px`;
    box.append(content);

    const frame = svgEl("foreignObject", { "pointer-events": "auto" });
    frame.style.overflow = "visible";
    frame.append(box);
    this.canvas.overlayLayer.append(frame);

    content.addEventListener("keydown", (event) => {
      // Keys typed into the editor must not reach tool shortcuts.
      event.stopPropagation();
      const finish =
        event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey));
      if (finish) {
        event.preventDefault();
        this.close();
      }
    });
    content.addEventListener("blur", () => this.close());

    // A click in the padding should still focus the text.
    box.addEventListener("mousedown", (event) => {
      if (event.target === box) {
        event.preventDefault();
        focusAtEnd(content);
      }
    });

    this.session = {
      id,
      frame,
      box,
      content,
      unsubscribe: this.diagram.subscribe(() => this.sync()),
    };
    this.sync();
    this.onChange();
    focusAtEnd(content);
  }

  close(): void {
    const session = this.session;
    if (!session) return;
    // Cleared first, so a blur fired by the removal cannot re-enter.
    this.session = null;

    session.unsubscribe();
    const text = session.content.innerText.replace(/\n$/, "");
    session.frame.remove();

    this.diagram.update(session.id, { text });
    this.onChange();
  }

  /** Keeps the editor aligned with its shape while it moves or changes. */
  private sync(): void {
    const session = this.session;
    if (!session) return;

    const shape = this.diagram.get(session.id);
    if (!shape) {
      this.close();
      return;
    }

    for (const [name, value] of Object.entries({
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
    })) {
      session.frame.setAttribute(name, String(value));
    }
    session.box.style.justifyContent = JUSTIFY[shape.valign];
    session.content.style.textAlign = TEXT_ALIGN[shape.align];
    session.content.style.font = cssFont(shape.fontSize);
    session.content.style.lineHeight = `${lineHeightFor(shape.fontSize)}px`;
  }
}

/** Prefers plaintext-only. Falls back where a browser does not support it. */
function setPlainTextEditable(el: HTMLElement): void {
  try {
    el.contentEditable = "plaintext-only";
  } catch {
    el.contentEditable = "true";
    el.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, text);
    });
  }
}

function focusAtEnd(el: HTMLElement): void {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  // When only the placeholder <br> is present, the caret belongs before it.
  // After it, the caret would land on a second, empty line.
  range.collapse(el.textContent === "");
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
