import type { Canvas } from "./canvas";
import type { Diagram, HAlign, RectShape, VAlign } from "./model";
import { renderIcon, type IconDef } from "./svg";
import { textStyle } from "./theme";

/** Distance between the bar and the shape. Clears the selection handles. */
const GAP = 12;
/** Minimum distance between the bar and the canvas edge. */
const EDGE = 8;

type AlignOption =
  | { readonly field: "align"; readonly value: HAlign; readonly label: string; readonly icon: IconDef }
  | { readonly field: "valign"; readonly value: VAlign; readonly label: string; readonly icon: IconDef };

// Icons in Lucide style (24 × 24 grid, round caps).
const H_OPTIONS: readonly AlignOption[] = [
  {
    field: "align",
    value: "left",
    label: "Align left",
    icon: [["path", { d: "M3 6h18M3 12h12M3 18h15" }]],
  },
  {
    field: "align",
    value: "center",
    label: "Align centre",
    icon: [["path", { d: "M3 6h18M6 12h12M4.5 18h15" }]],
  },
  {
    field: "align",
    value: "right",
    label: "Align right",
    icon: [["path", { d: "M3 6h18M9 12h12M6 18h15" }]],
  },
];

const V_OPTIONS: readonly AlignOption[] = [
  {
    field: "valign",
    value: "top",
    label: "Align top",
    icon: [
      ["path", { d: "M4 3h16" }],
      ["rect", { x: 8, y: 7, width: 8, height: 10, rx: 1.5 }],
    ],
  },
  {
    field: "valign",
    value: "middle",
    label: "Align middle",
    icon: [
      ["path", { d: "M3 12h5M16 12h5" }],
      ["rect", { x: 8, y: 7, width: 8, height: 10, rx: 1.5 }],
    ],
  },
  {
    field: "valign",
    value: "bottom",
    label: "Align bottom",
    icon: [
      ["path", { d: "M4 21h16" }],
      ["rect", { x: 8, y: 7, width: 8, height: 10, rx: 1.5 }],
    ],
  },
];

/**
 * Floating bar above the selected shape. Sets font size and text alignment.
 */
export class FormatBar {
  private readonly el: HTMLDivElement;
  private readonly alignButtons: Array<{ option: AlignOption; button: HTMLButtonElement }> = [];
  private readonly sizeInput: HTMLInputElement;
  private shape: RectShape | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly diagram: Diagram,
  ) {
    this.el = document.createElement("div");
    this.el.className = "format-bar";
    this.el.setAttribute("role", "toolbar");
    this.el.setAttribute("aria-label", "Text format");
    this.el.hidden = true;

    const sizeField = this.sizeField();
    this.sizeInput = sizeField.querySelector("input")!;

    this.el.append(
      sizeField,
      divider(),
      ...this.alignGroup(H_OPTIONS),
      divider(),
      ...this.alignGroup(V_OPTIONS),
    );
    canvas.host.append(this.el);
  }

  show(shape: RectShape): void {
    this.shape = shape;
    for (const { option, button } of this.alignButtons) {
      button.setAttribute("aria-pressed", String(shape[option.field] === option.value));
    }
    // Never overwrite what the user is typing.
    if (document.activeElement !== this.sizeInput) {
      this.sizeInput.value = String(shape.fontSize);
    }
    this.el.hidden = false;
    this.position(shape);
  }

  hide(): void {
    this.shape = null;
    this.el.hidden = true;
  }

  private sizeField(): HTMLLabelElement {
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(textStyle.minFontSize);
    input.max = String(textStyle.maxFontSize);
    input.step = "1";
    input.inputMode = "numeric";
    input.setAttribute("aria-label", "Font size in px");
    input.title = "Font size (px)";

    // Applies valid values live, so typing and the spin buttons both work.
    input.addEventListener("input", () => {
      const size = parseFontSize(input.value);
      if (size !== null && this.shape) this.diagram.update(this.shape.id, { fontSize: size });
    });
    // On commit, replace anything invalid with the value in effect.
    input.addEventListener("change", () => this.resetSizeInput());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", () => this.resetSizeInput());

    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = "px";
    unit.setAttribute("aria-hidden", "true");

    const label = document.createElement("label");
    label.className = "size-field";
    label.append(input, unit);
    return label;
  }

  private resetSizeInput(): void {
    const current = this.shape && this.diagram.get(this.shape.id);
    if (current) this.sizeInput.value = String(current.fontSize);
  }

  private alignGroup(options: readonly AlignOption[]): HTMLButtonElement[] {
    return options.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tool";
      button.title = option.label;
      button.setAttribute("aria-label", option.label);
      button.setAttribute("aria-pressed", "false");
      button.append(renderIcon(option.icon));

      // Keeps focus, and so the open text editor, where it is.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (this.shape) this.diagram.update(this.shape.id, { [option.field]: option.value });
      });

      this.alignButtons.push({ option, button });
      return button;
    });
  }

  /** Centred above the shape, or below it when there is no room above. */
  private position(shape: RectShape): void {
    const top = this.canvas.toHost({ x: shape.x + shape.width / 2, y: shape.y });
    const bottom = this.canvas.toHost({ x: shape.x, y: shape.y + shape.height });
    const { offsetWidth: w, offsetHeight: h } = this.el;
    const maxLeft = this.canvas.host.clientWidth - w - EDGE;

    let y = top.y - GAP - h;
    if (y < EDGE) y = bottom.y + GAP;
    const x = Math.min(Math.max(top.x - w / 2, EDGE), maxLeft);

    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }
}

/** Whole px within the allowed range, otherwise null. */
function parseFontSize(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value)) return null;
  if (value < textStyle.minFontSize || value > textStyle.maxFontSize) return null;
  return value;
}

function divider(): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "divider";
  el.setAttribute("aria-hidden", "true");
  return el;
}
