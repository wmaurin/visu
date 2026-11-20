import type { AppContext } from "../context";
import { inflate, MIN_SHAPE_SIZE, type Point, type Rect } from "../core/geometry";
import { setAttrs } from "../core/svg";
import type { Patch } from "../model/diagram";
import type { HAlign, RectShape, VAlign } from "../model/types";
import {
  HANDLE_HIT_SLOP,
  HANDLE_SIZE,
  outline,
  SELECTION_PADDING,
  sizeReadout,
  squareHandle,
} from "../render/overlay";
import { cssFont, lineHeightFor, textStyle } from "../render/theme";
import type { Gesture } from "../tools/tool";
import type { CanvasPointer } from "../ui/canvas";
import { choices, FloatingBar, numberField, type Choice } from "../ui/floating-bar";
import { focusAtEnd, makePlainTextEditable, type FieldSpec } from "../ui/inline-editor";
import { within, type Handler } from "./handler";

type HandleId = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";

interface ResizeHandle {
  readonly id: HandleId;
  /** Position along the outline, 0 = left/top, 1 = right/bottom. */
  readonly fx: 0 | 0.5 | 1;
  readonly fy: 0 | 0.5 | 1;
  readonly cursor: string;
}

/** Corners come first so they win when handles overlap on tiny shapes. */
const HANDLES: readonly ResizeHandle[] = [
  { id: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { id: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { id: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { id: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { id: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { id: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { id: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { id: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

// Icons in Lucide style (24 × 24 grid, round caps).
const H_ALIGN: ReadonlyArray<Choice<HAlign>> = [
  { value: "left", label: "Align left", icon: [["path", { d: "M3 6h18M3 12h12M3 18h15" }]] },
  { value: "center", label: "Align centre", icon: [["path", { d: "M3 6h18M6 12h12M4.5 18h15" }]] },
  { value: "right", label: "Align right", icon: [["path", { d: "M3 6h18M9 12h12M6 18h15" }]] },
];

const BOX = ["rect", { x: 8, y: 7, width: 8, height: 10, rx: 1.5 }] as const;
const V_ALIGN: ReadonlyArray<Choice<VAlign>> = [
  { value: "top", label: "Align top", icon: [["path", { d: "M4 3h16" }], BOX] },
  { value: "middle", label: "Align middle", icon: [["path", { d: "M3 12h5M16 12h5" }], BOX] },
  { value: "bottom", label: "Align bottom", icon: [["path", { d: "M4 21h16" }], BOX] },
];

const JUSTIFY: Record<VAlign, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };

/** Rectangles: move, resize with eight handles, text with format bar. */
export function shapeHandler(ctx: AppContext): Handler<RectShape> {
  const { diagram, canvas, editor } = ctx;
  const set = (s: RectShape, patch: Patch<"shapes">) => diagram.update("shapes", s.id, patch);

  return {
    cursor: "move",
    bar: new FloatingBar<RectShape>(canvas, "Text format", [
      [
        numberField({
          label: "Font size",
          unit: "px",
          min: textStyle.minFontSize,
          max: textStyle.maxFontSize,
          read: (s) => s.fontSize,
          write: (s, fontSize) => set(s, { fontSize }),
        }),
      ],
      choices(H_ALIGN, (s) => s.align, (s, align) => set(s, { align })),
      choices(V_ALIGN, (s) => s.valign, (s, valign) => set(s, { valign })),
    ]),

    bounds: (s) => s,

    overlay: (s) => [
      outline(inflate(s, SELECTION_PADDING), 6),
      ...HANDLES.map((h) => squareHandle(handleCentre(s, h))),
    ],

    handleAt: (s, p) => {
      const handle = HANDLES.find((h) => within(p, handleCentre(s, h), HANDLE_SIZE / 2 + HANDLE_HIT_SLOP));
      return handle ? { cursor: handle.cursor, begin: (start) => resize(ctx, s, handle.id, start) } : null;
    },

    drag: (s, start) => ({
      move: ({ point }) => set(s, { x: s.x + point.x - start.point.x, y: s.y + point.y - start.point.y }),
    }),

    doubleClick: (s) => editor.open({ kind: "shapes", id: s.id }, textField(ctx, s.id)),
  };
}

function handleCentre(r: Rect, h: ResizeHandle): Point {
  const box = inflate(r, SELECTION_PADDING);
  return { x: box.x + h.fx * box.width, y: box.y + h.fy * box.height };
}

function resize(ctx: AppContext, origin: RectShape, handle: HandleId, start: CanvasPointer): Gesture {
  const overlay = ctx.canvas.overlay();
  return {
    move: ({ point }) => {
      const bounds = resizeBounds(origin, handle, point.x - start.point.x, point.y - start.point.y);
      ctx.diagram.update("shapes", origin.id, bounds);
      overlay.replaceChildren(sizeReadout(bounds));
    },
    dispose: () => overlay.remove(),
  };
}

/**
 * Moves the edges named by the handle by the given delta. The opposite
 * edges stay fixed and the shape never shrinks below MIN_SHAPE_SIZE.
 */
function resizeBounds(origin: Rect, handle: HandleId, dx: number, dy: number): Rect {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;

  if (handle.includes("w")) left = Math.min(left + dx, right - MIN_SHAPE_SIZE);
  if (handle.includes("e")) right = Math.max(right + dx, left + MIN_SHAPE_SIZE);
  if (handle.includes("n")) top = Math.min(top + dy, bottom - MIN_SHAPE_SIZE);
  if (handle.includes("s")) bottom = Math.max(bottom + dy, top + MIN_SHAPE_SIZE);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Multi-line text editing inside the shape, laid out like the rendered text. */
function textField(ctx: AppContext, id: string): FieldSpec {
  const shape = () => ctx.diagram.get("shapes", id);
  return {
    multiline: true,
    text: () => shape()?.text,

    create(text) {
      const field = document.createElement("div");
      field.className = "text-editor-content";
      makePlainTextEditable(field);
      field.spellcheck = false;
      field.textContent = text;
      field.style.color = textStyle.fill;
      // An empty editable has no line box, so the caret ignores text-align
      // until the first character arrives. A placeholder <br> creates the line.
      if (text === "") field.append(document.createElement("br"));

      const root = document.createElement("div");
      root.className = "text-editor";
      root.style.padding = `${textStyle.padding}px`;
      root.append(field);
      // A click in the padding should still focus the text.
      root.addEventListener("mousedown", (event) => {
        if (event.target !== root) return;
        event.preventDefault();
        focusAtEnd(field);
      });
      return { root, field };
    },

    layout(frame, root, field) {
      const s = shape();
      if (!s) return false;
      setAttrs(frame, { x: s.x, y: s.y, width: s.width, height: s.height });
      root.style.justifyContent = JUSTIFY[s.valign];
      field.style.textAlign = s.align;
      field.style.font = cssFont(s.fontSize);
      field.style.lineHeight = `${lineHeightFor(s.fontSize)}px`;
      return true;
    },

    commit: (text) => ctx.diagram.update("shapes", id, { text }),
  };
}
