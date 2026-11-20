import type { Rect } from "../core/geometry";

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type Side = "n" | "e" | "s" | "w";
export type Routing = "straight" | "orthogonal";
/** Solid for requests and flows, dashed for lookups, control plane and async paths. */
export type LineStyle = "solid" | "dashed";
/** How a line end is drawn. */
export type Cap = "none" | "arrow";

/** Colour palette. The hex values live in render/theme. */
export const COLOR_NAMES = [
  "black",
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "sky",
  "blue",
  "indigo",
  "violet",
  "rose",
] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

export interface RectShape extends Rect {
  readonly id: string;
  readonly kind: "rect";
  readonly text: string;
  readonly align: HAlign;
  readonly valign: VAlign;
  /** In px, like every other diagram unit. */
  readonly fontSize: number;
  /** Border colour. The fill is this colour mixed with white. */
  readonly color: ColorName;
  /** Fill strength, 0 (white) to 100 (full colour). */
  readonly saturation: number;
  /** Rectangle this one sits in, or null at the top level. See model/hierarchy. */
  readonly parentId: string | null;
}

/** Union of all box-like shape kinds. Extend as new shapes arrive. */
export type Shape = RectShape;

/**
 * A line end. Attached ends follow their shape when it moves or resizes,
 * free ends stay at a fixed grid point.
 */
export type Endpoint =
  | { readonly kind: "anchor"; readonly shapeId: string; readonly side: Side; readonly offset: number }
  | { readonly kind: "free"; readonly x: number; readonly y: number };

export interface LineShape {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly routing: Routing;
  readonly style: LineStyle;
  readonly color: ColorName;
  /** Strength of the colour, 0 (white) to 100 (full colour). */
  readonly saturation: number;
  readonly startCap: Cap;
  readonly endCap: Cap;
}

/**
 * Text on a line. `t` is the fraction of the line's arc length, from 0 at
 * the start to 1 at the end, so the label keeps its relative place when
 * the route changes.
 */
export interface LineLabel {
  readonly id: string;
  readonly lineId: string;
  readonly text: string;
  readonly t: number;
  /** In px. The tag around the text scales with it. */
  readonly fontSize: number;
}

/**
 * Free standing text. (x, y) is its anchor, the point of the text box
 * named by `align` and `valign`, e.g. the top left corner. The anchor
 * snaps to the grid, so text lines up with shape edges.
 */
export interface FreeText {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** In px. The box around the text scales with it. */
  readonly fontSize: number;
  readonly align: HAlign;
  readonly valign: VAlign;
  /** Rectangle this text sits in, or null at the top level. */
  readonly parentId: string | null;
}

/** Items that can sit inside a rectangle. */
export type ChildKind = "shapes" | "texts";

/**
 * Export area, like an artboard. Shown in the editor, never exported
 * itself. Its bounds become the viewBox of the exported SVG.
 */
export interface ExportFrame extends Rect {
  readonly id: string;
  /** Shown above the top left corner and used as the export file name. */
  readonly name: string;
}

/**
 * The whole diagram. Immutable: every change produces a new Doc, which
 * makes snapshots, cancel and undo trivial.
 */
export interface Doc {
  readonly shapes: readonly Shape[];
  readonly lines: readonly LineShape[];
  readonly labels: readonly LineLabel[];
  readonly texts: readonly FreeText[];
  readonly frames: readonly ExportFrame[];
}

export type Collection = keyof Doc;
export type Item<C extends Collection> = Doc[C][number];
export type AnyItem = Item<Collection>;

/** Points at one item, e.g. the selection or the item being edited. */
export interface Ref {
  readonly kind: Collection;
  readonly id: string;
}

export function sameRef(a: Ref | null, b: Ref | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
}
