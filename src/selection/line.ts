import type { AppContext } from "../context";
import { boundsOf, samePoint } from "../core/geometry";
import type { IconDef } from "../core/svg";
import type { Patch } from "../model/diagram";
import { newId } from "../model/diagram";
import { connectionTarget, resolve, route } from "../model/queries";
import type { Cap, LineShape, LineStyle, Routing } from "../model/types";
import { fractionAlong } from "../layout/path";
import { anchorHints, HANDLE_HIT_SLOP, highlight, roundHandle, ROUND_HANDLE_RADIUS } from "../render/overlay";
import { tagStyle } from "../render/theme";
import type { Gesture } from "../tools/tool";
import { colorField, dropdown, FloatingBar, type Choice } from "../ui/floating-bar";
import { within, type Handler } from "./handler";
import { labelField } from "./label";

type LineEnd = "from" | "to";

// Icons in Lucide style (24 × 24 grid, round caps).
const LINE: IconDef = [["path", { d: "M4 12h16" }]];
const DOTS: IconDef = [
  ["circle", { cx: 5, cy: 19, r: 1.5 }],
  ["circle", { cx: 19, cy: 5, r: 1.5 }],
];

const START_CAP: ReadonlyArray<Choice<Cap>> = [
  { value: "none", label: "Line", icon: LINE },
  { value: "arrow", label: "Arrow", icon: [["path", { d: "M4 12h16M9 7l-5 5 5 5" }]] },
];

const END_CAP: ReadonlyArray<Choice<Cap>> = [
  { value: "none", label: "Line", icon: LINE },
  { value: "arrow", label: "Arrow", icon: [["path", { d: "M4 12h16M15 7l5 5-5 5" }]] },
];

const STYLE: ReadonlyArray<Choice<LineStyle>> = [
  { value: "solid", label: "Solid", icon: [["path", { d: "M4 12h16" }]] },
  { value: "dashed", label: "Dashed", icon: [["path", { d: "M4 12h3M10.5 12h3M17 12h3" }]] },
];

const ROUTING: ReadonlyArray<Choice<Routing>> = [
  { value: "straight", label: "Straight", icon: [["path", { d: "M6 18L18 6" }], ...DOTS] },
  { value: "orthogonal", label: "Orthogonal", icon: [["path", { d: "M6.5 19H12V5h5.5" }], ...DOTS] },
];

/**
 * Lines: a handle on each end reconnects it, the format bar sets caps and
 * routing, and a double-click adds a label at the pointer.
 */
export function lineHandler(ctx: AppContext): Handler<LineShape> {
  const { diagram, canvas } = ctx;
  const set = (l: LineShape, patch: Patch<"lines">) => diagram.update("lines", l.id, patch);
  const points = (l: LineShape) => route(diagram.doc, l);

  return {
    cursor: "pointer",
    bar: new FloatingBar<LineShape>(canvas, "Line format", [
      dropdown("Line start", START_CAP, (l) => l.startCap, (l, startCap) => set(l, { startCap })),
      dropdown("Line end", END_CAP, (l) => l.endCap, (l, endCap) => set(l, { endCap })),
      dropdown("Style", STYLE, (l) => l.style, (l, style) => set(l, { style })),
      colorField("Colour", (l) => l, (l, value) => set(l, value)),
      dropdown("Routing", ROUTING, (l) => l.routing, (l, routing) => set(l, { routing })),
    ]),

    bounds: (l) => {
      const pts = points(l);
      return pts && boundsOf(pts);
    },

    overlay: (l) => {
      const pts = points(l);
      return pts ? [highlight(pts), roundHandle(pts[0]!), roundHandle(pts[pts.length - 1]!)] : [];
    },

    handleAt: (l, p) => {
      const pts = points(l);
      if (!pts) return null;
      const reach = ROUND_HANDLE_RADIUS + HANDLE_HIT_SLOP;
      const end: LineEnd | null = within(p, pts[0]!, reach)
        ? "from"
        : within(p, pts[pts.length - 1]!, reach)
          ? "to"
          : null;
      return end ? { cursor: "move", begin: () => reconnect(ctx, l, end) } : null;
    },

    doubleClick: (l, p) => {
      const pts = points(l);
      if (!pts) return;
      const ref = { kind: "labels", id: newId() } as const;
      diagram.add("labels", {
        id: ref.id,
        lineId: l.id,
        text: "",
        t: fractionAlong(pts, p.raw),
        fontSize: tagStyle.defaultFontSize,
        bold: false,
      });
      ctx.selection.set(ref);
      ctx.editor.open(ref, labelField(ctx, ref.id));
    },
  };
}

/**
 * Drags one end to another anchor or grid point. A target on the other
 * end's position is skipped, as it would collapse the line.
 */
function reconnect(ctx: AppContext, line: LineShape, end: LineEnd): Gesture {
  const overlay = ctx.canvas.overlay();
  const other = resolve(ctx.diagram.doc, end === "from" ? line.to : line.from);
  return {
    move: ({ point, raw }) => {
      const target = connectionTarget(ctx.diagram.doc, point, raw);
      overlay.replaceChildren(...anchorHints(target));
      if (other && samePoint(other, target.point)) return;
      ctx.diagram.update("lines", line.id, end === "from" ? { from: target.end } : { to: target.end });
    },
    dispose: () => overlay.remove(),
  };
}
