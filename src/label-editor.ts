import type { Canvas } from "./canvas";
import { pointAlong, TAG_HEIGHT, tagWidth } from "./labels";
import type { Diagram } from "./model";
import { svgEl } from "./svg";
import { colours, font, ui } from "./theme";

/** Room for a few characters while the label is still short. */
const MIN_WIDTH = 64;

interface Session {
  readonly id: string;
  readonly frame: SVGForeignObjectElement;
  readonly input: HTMLInputElement;
  readonly unsubscribe: () => void;
}

/**
 * In-place editor for a line label: a single line text field centred on
 * the label's place on the line. It grows with its content.
 *
 * Editing ends on blur, Enter or Escape. A label left empty is removed.
 */
export class LabelEditor {
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
    const found = this.diagram.findLabel(id);
    if (!found) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "label-editor";
    input.value = found.label.text;
    input.spellcheck = false;
    input.setAttribute("aria-label", "Line label");
    Object.assign(input.style, {
      fontFamily: font.mono,
      fontSize: "11px",
      color: colours.ink2,
      borderColor: ui.selection,
    });

    const frame = svgEl("foreignObject", { "pointer-events": "auto", height: TAG_HEIGHT });
    frame.style.overflow = "visible";
    frame.append(input);
    this.canvas.overlayLayer.append(frame);

    input.addEventListener("keydown", (event) => {
      // Keys typed into the editor must not reach tool shortcuts.
      event.stopPropagation();
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
    input.addEventListener("input", () => this.sync());
    input.addEventListener("blur", () => this.close());

    this.session = {
      id,
      frame,
      input,
      unsubscribe: this.diagram.subscribe(() => this.sync()),
    };
    this.sync();
    this.onChange();
    input.focus();
    input.select();
  }

  close(): void {
    const session = this.session;
    if (!session) return;
    // Cleared first, so a blur fired by the removal cannot re-enter.
    this.session = null;

    session.unsubscribe();
    const text = session.input.value.trim();
    session.frame.remove();

    if (text === "") this.diagram.remove(session.id);
    else this.diagram.updateLabel(session.id, { text });
    this.onChange();
  }

  /** Keeps the field centred on the label while it moves or grows. */
  private sync(): void {
    const session = this.session;
    if (!session) return;

    const found = this.diagram.findLabel(session.id);
    const points = found ? this.diagram.route(found.line) : null;
    if (!found || !points) {
      this.close();
      return;
    }

    const centre = pointAlong(points, found.label.t);
    const width = Math.max(tagWidth(session.input.value), MIN_WIDTH);
    session.frame.setAttribute("x", String(centre.x - width / 2));
    session.frame.setAttribute("y", String(centre.y - TAG_HEIGHT / 2));
    session.frame.setAttribute("width", String(width));
  }
}
