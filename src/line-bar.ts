import type { Canvas } from "./canvas";
import { barButton, createBar, placeBar } from "./floating-bar";
import type { Point } from "./geometry";
import type { Diagram, LineShape } from "./model";
import type { Routing } from "./routing";
import type { IconDef } from "./svg";

interface RoutingOption {
  readonly value: Routing;
  readonly label: string;
  readonly icon: IconDef;
}

// Icons in Lucide style (24 × 24 grid, round caps).
const ROUTING_OPTIONS: readonly RoutingOption[] = [
  {
    value: "straight",
    label: "Straight line",
    icon: [
      ["path", { d: "M6 18L18 6" }],
      ["circle", { cx: 5, cy: 19, r: 1.5 }],
      ["circle", { cx: 19, cy: 5, r: 1.5 }],
    ],
  },
  {
    value: "orthogonal",
    label: "Orthogonal line",
    icon: [
      ["path", { d: "M6.5 19H12V5h5.5" }],
      ["circle", { cx: 5, cy: 19, r: 1.5 }],
      ["circle", { cx: 19, cy: 5, r: 1.5 }],
    ],
  },
];

/** Floating bar above the selected line. Sets how the line is routed. */
export class LineBar {
  private readonly el: HTMLDivElement;
  private readonly buttons: Array<{ option: RoutingOption; button: HTMLButtonElement }>;
  private line: LineShape | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly diagram: Diagram,
  ) {
    this.el = createBar(canvas, "Line format");
    this.buttons = ROUTING_OPTIONS.map((option) => ({
      option,
      button: barButton(option.label, option.icon, () => {
        if (this.line) this.diagram.updateLine(this.line.id, { routing: option.value });
      }),
    }));
    this.el.append(...this.buttons.map((b) => b.button));
  }

  show(line: LineShape, points: readonly Point[]): void {
    this.line = line;
    for (const { option, button } of this.buttons) {
      button.setAttribute("aria-pressed", String(line.routing === option.value));
    }
    placeBar(this.canvas, this.el, boundingBox(points));
  }

  hide(): void {
    this.line = null;
    this.el.hidden = true;
  }
}

function boundingBox(points: readonly Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
