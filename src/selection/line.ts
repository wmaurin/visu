import type { AppContext } from "../context";
import { boundsOf, samePoint } from "../core/geometry";
import type { IconDef } from "../core/svg";
import type { Patch } from "../model/diagram";
import { newId } from "../model/diagram";
import { connectionTarget, resolve, route } from "../model/queries";
import type { Cap, LineShape, Routing } from "../model/types";
import { fractionAlong } from "../layout/path";
import { anchorHints, HANDLE_HIT_SLOP, highlight, roundHandle, ROUND_HANDLE_RADIUS } from "../render/overlay";
import type { Gesture } from "../tools/tool";
import { choices, FloatingBar, type Choice } from "../ui/floating-bar";
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
  { value: "none", label: "Start: line", icon: LINE },
  { value: "arrow", label: "Start: arrow", icon: [["path", { d: "M4 12h16M9 7l-5 5 5 5" }]] },
];

const ROUTING: ReadonlyArray<Choice<Routing>> = [
  { value: "straight", label: "Straight line", icon: [["path", { d: "M6 18L18 6" }], ...DOTS] },
  { value: "orthogonal", label: "Orthogonal line", icon: [["path", { d: "M6.5 19H12V5h5.5" }], ...DOTS] },
];

const END_CAP: ReadonlyArray<Choice<Cap>> = [
  { value: "none", label: "End: line", icon: LINE },
  { value: "arrow", label: "End: arrow", icon: [["path", { d: "M4 12h16M15 7l5 5-5 5" }]] },
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
      choices(START_CAP, (l) => l.startCap, (l, startCap) => set(l, { startCap })),
      choices(ROUTING, (l) => l.routing, (l, routing) => set(l, { routing })),
      choices(END_CAP, (l) => l.endCap, (l, endCap) => set(l, { endCap })),
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
      diagram.add("labels", { id: ref.id, lineId: l.id, text: "", t: fractionAlong(pts, p.raw) });
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
