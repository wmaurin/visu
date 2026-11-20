import type { Canvas } from "./canvas";
import { barButton, barDivider, createBar, placeBar } from "./floating-bar";
import type { Point } from "./geometry";
import type { Cap, Diagram, LinePatch, LineShape } from "./model";
import type { Routing } from "./routing";
import type { IconDef } from "./svg";

/** One toggle in the bar: sets `field` to `value` on the selected line. */
type Option =
  | { readonly field: "startCap" | "endCap"; readonly value: Cap; readonly label: string; readonly icon: IconDef }
  | { readonly field: "routing"; readonly value: Routing; readonly label: string; readonly icon: IconDef };

// Icons in Lucide style (24 × 24 grid, round caps).
const LINE: IconDef = [["path", { d: "M4 12h16" }]];

const START_OPTIONS: readonly Option[] = [
  { field: "startCap", value: "none", label: "Start: line", icon: LINE },
  {
    field: "startCap",
    value: "arrow",
    label: "Start: arrow",
    icon: [["path", { d: "M4 12h16M9 7l-5 5 5 5" }]],
  },
];

const ROUTING_OPTIONS: readonly Option[] = [
  {
    field: "routing",
    value: "straight",
    label: "Straight line",
    icon: [
      ["path", { d: "M6 18L18 6" }],
      ["circle", { cx: 5, cy: 19, r: 1.5 }],
      ["circle", { cx: 19, cy: 5, r: 1.5 }],
    ],
  },
  {
    field: "routing",
    value: "orthogonal",
    label: "Orthogonal line",
    icon: [
      ["path", { d: "M6.5 19H12V5h5.5" }],
      ["circle", { cx: 5, cy: 19, r: 1.5 }],
      ["circle", { cx: 19, cy: 5, r: 1.5 }],
    ],
  },
];

const END_OPTIONS: readonly Option[] = [
  { field: "endCap", value: "none", label: "End: line", icon: LINE },
  {
    field: "endCap",
    value: "arrow",
    label: "End: arrow",
    icon: [["path", { d: "M4 12h16M15 7l5 5-5 5" }]],
  },
];

/**
 * Floating bar above the selected line. Left group: start of the line,
 * middle: routing, right group: end of the line. Start and end follow
 * the drawing direction.
 */
export class LineBar {
  private readonly el: HTMLDivElement;
  private readonly buttons: Array<{ option: Option; button: HTMLButtonElement }> = [];
  private line: LineShape | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly diagram: Diagram,
  ) {
    this.el = createBar(canvas, "Line format");
    this.el.append(
      ...this.group(START_OPTIONS),
      barDivider(),
      ...this.group(ROUTING_OPTIONS),
      barDivider(),
      ...this.group(END_OPTIONS),
    );
  }

  show(line: LineShape, points: readonly Point[]): void {
    this.line = line;
    for (const { option, button } of this.buttons) {
      button.setAttribute("aria-pressed", String(line[option.field] === option.value));
    }
    placeBar(this.canvas, this.el, boundingBox(points));
  }

  hide(): void {
    this.line = null;
    this.el.hidden = true;
  }

  private group(options: readonly Option[]): HTMLButtonElement[] {
    return options.map((option) => {
      const button = barButton(option.label, option.icon, () => {
        if (!this.line) return;
        const patch: LinePatch = { [option.field]: option.value };
        this.diagram.updateLine(this.line.id, patch);
      });
      this.buttons.push({ option, button });
      return button;
    });
  }
}

function boundingBox(points: readonly Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
