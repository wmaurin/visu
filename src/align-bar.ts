import type { Canvas } from "./canvas";
import type { Diagram, HAlign, RectShape, VAlign } from "./model";
import { renderIcon, type IconDef } from "./svg";

/** Distance between the bar and the shape. Clears the selection handles. */
const GAP = 12;
/** Minimum distance between the bar and the canvas edge. */
const EDGE = 8;

type Option =
  | { readonly field: "align"; readonly value: HAlign; readonly label: string; readonly icon: IconDef }
  | { readonly field: "valign"; readonly value: VAlign; readonly label: string; readonly icon: IconDef };

// Icons in Lucide style (24 × 24 grid, round caps).
const H_OPTIONS: readonly Option[] = [
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

const V_OPTIONS: readonly Option[] = [
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

/** Floating bar above the selected shape to set its text alignment. */
export class AlignBar {
  private readonly el: HTMLDivElement;
  private readonly buttons: Array<{ option: Option; button: HTMLButtonElement }> = [];
  private shapeId: string | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly diagram: Diagram,
  ) {
    this.el = document.createElement("div");
    this.el.className = "align-bar";
    this.el.setAttribute("role", "toolbar");
    this.el.setAttribute("aria-label", "Text alignment");
    this.el.hidden = true;

    this.el.append(...this.group(H_OPTIONS), divider(), ...this.group(V_OPTIONS));
    canvas.host.append(this.el);
  }

  show(shape: RectShape): void {
    this.shapeId = shape.id;
    for (const { option, button } of this.buttons) {
      button.setAttribute("aria-pressed", String(shape[option.field] === option.value));
    }
    this.el.hidden = false;
    this.position(shape);
  }

  hide(): void {
    this.shapeId = null;
    this.el.hidden = true;
  }

  private group(options: readonly Option[]): HTMLButtonElement[] {
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
        if (this.shapeId) this.diagram.update(this.shapeId, { [option.field]: option.value });
      });

      this.buttons.push({ option, button });
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

function divider(): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "divider";
  el.setAttribute("aria-hidden", "true");
  return el;
}
