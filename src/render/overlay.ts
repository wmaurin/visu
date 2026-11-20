import { grid, type Point, type Rect } from "../core/geometry";
import { svgEl } from "../core/svg";
import { allAnchors } from "../layout/anchors";
import { pathData } from "../layout/path";
import type { Target } from "../model/queries";
import type { Shape } from "../model/types";
import { colours, font, nodeStyle, ui } from "./theme";

/**
 * Building blocks for editor feedback in the overlay layer. Each returns
 * fresh elements, so overlays are simply rebuilt on every change.
 */

/** Edge length of a square handle. */
export const HANDLE_SIZE = 8;
/** Radius of a round handle. */
export const ROUND_HANDLE_RADIUS = 5;
/** Extra grab margin around a handle, so it is easy to hit. */
export const HANDLE_HIT_SLOP = 3;

export function outline(box: Rect, rx: number): SVGRectElement {
  return svgEl("rect", { ...box, rx, fill: "none", stroke: ui.selection, "stroke-width": 1 });
}

/**
 * The smallest rectangle on grid lines that contains `r`. Selection marks
 * sit on it, so they line up with the grid: exactly on the border of
 * rectangles and frames, rounded outwards around texts and labels.
 */
export function selectionBox(r: Rect): Rect {
  const g = grid();
  const x = Math.floor(r.x / g) * g;
  const y = Math.floor(r.y / g) * g;
  const right = Math.ceil((r.x + r.width) / g) * g;
  const bottom = Math.ceil((r.y + r.height) / g) * g;
  return { x, y, width: right - x, height: bottom - y };
}

/** Selection outline of an item with the given bounds. Rounded like a rectangle, so it traces one exactly. */
export function selectionOutline(bounds: Rect): SVGRectElement {
  return outline(selectionBox(bounds), nodeStyle.rx);
}

export function squareHandle(c: Point): SVGRectElement {
  return svgEl("rect", {
    x: c.x - HANDLE_SIZE / 2,
    y: c.y - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    rx: 2,
    fill: colours.paper,
    stroke: ui.selection,
    "stroke-width": 1,
  });
}

export function roundHandle(c: Point): SVGCircleElement {
  return svgEl("circle", {
    cx: c.x,
    cy: c.y,
    r: ROUND_HANDLE_RADIUS,
    fill: colours.paper,
    stroke: ui.selection,
    "stroke-width": 1.5,
  });
}

export function highlight(points: readonly Point[]): SVGPathElement {
  return svgEl("path", {
    d: pathData(points),
    fill: "none",
    stroke: ui.selection,
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
}

/** Width × height next to the bottom right corner. */
export function sizeReadout(r: Rect): SVGTextElement {
  const text = svgEl("text", {
    x: r.x + r.width + 10,
    y: r.y + r.height + 18,
    "font-family": font.mono,
    "font-size": 11,
    fill: colours.muted,
  });
  text.textContent = `${r.width} × ${r.height}`;
  return text;
}

/**
 * Anchor dots of the target shape and any extra shapes, plus a marker on
 * the point a line end would snap to.
 */
export function anchorHints(target: Target, extraShapes: ReadonlyArray<Shape | undefined> = []): SVGElement[] {
  const shapes = new Set([...extraShapes, target.shape].filter((s) => s !== undefined));
  const dots = [...shapes].flatMap((s) =>
    allAnchors(s).map((p) =>
      svgEl("circle", {
        cx: p.x,
        cy: p.y,
        r: 2.5,
        fill: colours.paper,
        stroke: ui.selection,
        "stroke-width": 1,
      }),
    ),
  );
  return [...dots, svgEl("circle", { cx: target.point.x, cy: target.point.y, r: 4, fill: ui.selection })];
}
