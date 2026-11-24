import { arr, bool, nullable, num, obj, oneOf, optional, str, ValidationError, type Check } from "../core/validate";
import type { Point } from "../core/geometry";
import { childBounds, parentFor } from "../model/queries";
import {
  COLOR_NAMES,
  type Doc,
  type Endpoint,
  type ExportFrame,
  type FreeText,
  type LineLabel,
  type LineShape,
  type Overlay,
  type RectShape,
  type Side,
} from "../model/types";
import { tagStyle, textStyle } from "../render/theme";

/**
 * Project file format: the whole document as versioned JSON.
 *
 *   { "format": "visu", "version": 2, "name": "…", "doc": { shapes, lines, labels, texts, overlays, frames } }
 *
 * Version 1 files predate overlays and are read as having none.
 *
 * Only ids, geometry, line ends, label texts and frame names are required.
 * Every other field may be left out and gets the value a new item gets in
 * the editor, so hand written files stay short. Two fields depend on the
 * rest of the document:
 *
 *   - `parentId` left out: the innermost rectangle that contains the item,
 *     as the editor would set it after a move.
 *   - `offset` of an anchor left out: the middle of its side, on the
 *     router's 8 px lattice.
 *
 * An endpoint without `kind` is an anchor when it has a `shapeId` and a
 * free point otherwise. Saved files always carry every field.
 *
 * Imported files are untrusted. Every field is checked, unknown fields are
 * dropped, and references between items must resolve.
 */

const FORMAT = "visu";
const VERSION = 2;

export const PROJECT_FILE = {
  /** Appended to the project name, e.g. "Projekt_Eins.visu.json". */
  extension: "visu.json",
  type: "application/json",
  accept: ".json,application/json",
  maxBytes: 5 * 1024 * 1024,
};

/** Generous limits that still keep a hostile file from exhausting the browser. */
const MAX_ITEMS = 10_000;
const MAX_TEXT = 10_000;
const COORD = num(-1_000_000, 1_000_000);
const SIZE = num(1, 1_000_000);
const FONT_SIZE = num(textStyle.minFontSize, textStyle.maxFontSize);
const ID = str(64, /^[\w-]+$/);
const H_ALIGN = oneOf("left", "center", "right");
const V_ALIGN = oneOf("top", "middle", "bottom");
const CAP = oneOf("none", "arrow");
const PARENT = nullable(ID);
/** Left out means "derive it from the geometry", see `complete`. */
const AUTO_PARENT = optional<string | null | undefined>(PARENT, undefined);
const TEXT_COLOR = oneOf("black", "white");
const COLOR = oneOf(...COLOR_NAMES);
const SATURATION = num(0, 100);

/** Items as read, before `complete` fills in the fields that depend on the rest. */
type Raw<T> = Omit<T, "parentId"> & { readonly parentId: string | null | undefined };
type RawAnchor = Omit<Extract<Endpoint, { kind: "anchor" }>, "offset"> & { readonly offset: number | undefined };
type RawEndpoint = RawAnchor | Extract<Endpoint, { kind: "free" }>;
type RawLine = Omit<LineShape, "from" | "to"> & { readonly from: RawEndpoint; readonly to: RawEndpoint };
type RawDoc = Omit<Doc, "shapes" | "lines" | "texts"> & {
  readonly shapes: readonly Raw<RectShape>[];
  readonly lines: readonly RawLine[];
  readonly texts: readonly Raw<FreeText>[];
};

const rect = obj<Raw<RectShape>>({
  id: ID,
  kind: optional(oneOf("rect"), "rect"),
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  text: optional(str(MAX_TEXT), ""),
  align: optional(H_ALIGN, "center"),
  valign: optional(V_ALIGN, "middle"),
  fontSize: optional(FONT_SIZE, textStyle.defaultFontSize),
  bold: optional(bool, false),
  textColor: optional(TEXT_COLOR, "black"),
  color: optional(COLOR, "black"),
  saturation: optional(SATURATION, 0),
  parentId: AUTO_PARENT,
});

const anchorEnd = obj<RawAnchor>({
  kind: optional(oneOf("anchor"), "anchor"),
  shapeId: ID,
  side: oneOf("n", "e", "s", "w"),
  offset: optional<number | undefined>(num(0, 1_000_000), undefined),
});
const freeEnd = obj<Extract<Endpoint, { kind: "free" }>>({ kind: optional(oneOf("free"), "free"), x: COORD, y: COORD });
const endpoint: Check<RawEndpoint> = (v, path) => {
  const end = v as { kind?: unknown; shapeId?: unknown } | null;
  const isAnchor = end?.kind === "anchor" || (end?.kind === undefined && end?.shapeId !== undefined);
  return isAnchor ? anchorEnd(v, path) : freeEnd(v, path);
};

const line = obj<RawLine>({
  id: ID,
  from: endpoint,
  to: endpoint,
  routing: optional(oneOf("straight", "orthogonal"), "orthogonal"),
  middle: optional(nullable(obj<Point>({ x: COORD, y: COORD })), null),
  style: optional(oneOf("solid", "dashed"), "solid"),
  color: optional(COLOR, "black"),
  saturation: optional(SATURATION, 100),
  startCap: optional(CAP, "none"),
  endCap: optional(CAP, "arrow"),
});

const label = obj<LineLabel>({
  id: ID,
  lineId: ID,
  text: str(MAX_TEXT),
  t: optional(num(0, 1), 0.5),
  fontSize: optional(FONT_SIZE, tagStyle.defaultFontSize),
  bold: optional(bool, false),
  textColor: optional(TEXT_COLOR, "black"),
});

const text = obj<Raw<FreeText>>({
  id: ID,
  x: COORD,
  y: COORD,
  text: str(MAX_TEXT),
  fontSize: optional(FONT_SIZE, tagStyle.defaultFontSize),
  bold: optional(bool, false),
  textColor: optional(TEXT_COLOR, "black"),
  align: optional(H_ALIGN, "left"),
  valign: optional(V_ALIGN, "top"),
  parentId: AUTO_PARENT,
});

const overlay = obj<Overlay>({
  id: ID,
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  color: optional(COLOR, "sky"),
  saturation: optional(SATURATION, 100),
  transparency: optional(num(0, 100), 90),
});

const frame = obj<ExportFrame>({ id: ID, x: COORD, y: COORD, width: SIZE, height: SIZE, name: str(200) });

const doc = obj<RawDoc>({
  shapes: optional(arr(rect, MAX_ITEMS), []),
  lines: optional(arr(line, MAX_ITEMS), []),
  labels: optional(arr(label, MAX_ITEMS), []),
  texts: optional(arr(text, MAX_ITEMS), []),
  overlays: optional(arr(overlay, MAX_ITEMS), []),
  frames: optional(arr(frame, MAX_ITEMS), []),
});

/** A project: its name and the diagram. */
export interface Project {
  readonly name: string;
  readonly doc: Doc;
}

const file = obj<{ format: string; version: number; name: string; doc: RawDoc }>({
  format: oneOf(FORMAT),
  version: oneOf(VERSION),
  name: str(200),
  doc,
});

export function serializeProject({ name, doc: d }: Project): string {
  return `${JSON.stringify({ format: FORMAT, version: VERSION, name, doc: d }, null, 2)}\n`;
}

/** Parses and validates a project file. Throws a readable error when it cannot be used. */
export function parseProject(text: string): Project {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new ValidationError("The file is not valid JSON.");
  }
  const { name, doc: raw } = file(upgrade(input), "file");
  const d = complete(raw);
  checkReferences(d);
  return { name, doc: d };
}

/** The router's lattice in px. Anchors on it get routed around shapes. */
const LATTICE = 8;

/** Middle of a side, rounded to the lattice. */
function middleOf(shape: Raw<RectShape> | undefined, side: Side): number {
  const length = !shape ? 0 : side === "n" || side === "s" ? shape.width : shape.height;
  return Math.round(length / 2 / LATTICE) * LATTICE;
}

/**
 * Fills in the fields that were left out and depend on other items:
 * anchor offsets and parents. Unknown ids are left for `checkReferences`
 * to report.
 */
function complete(raw: RawDoc): Doc {
  const shapes = new Map(raw.shapes.map((s) => [s.id, s]));
  const end = (e: RawEndpoint): Endpoint =>
    e.kind === "free" ? e : { ...e, offset: e.offset ?? middleOf(shapes.get(e.shapeId), e.side) };

  // Parents first resolve against a document where left out ones are top level.
  const base: Doc = {
    ...raw,
    shapes: raw.shapes.map((s) => ({ ...s, parentId: s.parentId ?? null })),
    lines: raw.lines.map((l) => ({ ...l, from: end(l.from), to: end(l.to) })),
    texts: raw.texts.map((t) => ({ ...t, parentId: t.parentId ?? null })),
  };
  return {
    ...base,
    shapes: base.shapes.map((s, i) =>
      raw.shapes[i]!.parentId !== undefined ? s : { ...s, parentId: parentFor(base, { kind: "shapes", id: s.id }, s) },
    ),
    texts: base.texts.map((t, i) =>
      raw.texts[i]!.parentId !== undefined
        ? t
        : { ...t, parentId: parentFor(base, { kind: "texts", id: t.id }, childBounds(t)) },
    ),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Brings an older file to the current version before it is checked.
 * Anything unexpected is passed on unchanged, so the checks report it.
 */
function upgrade(input: unknown): unknown {
  if (!isRecord(input) || input.version !== 1 || !isRecord(input.doc)) return input;
  return { ...input, version: VERSION, doc: { ...input.doc, overlays: [] } };
}

/** IDs are unique across the document and every reference points at an existing item. */
function checkReferences(d: Doc): void {
  const seen = new Set<string>();
  for (const [kind, items] of Object.entries(d) as Array<[string, ReadonlyArray<{ id: string }>]>) {
    items.forEach((item, i) => {
      if (seen.has(item.id)) throw new ValidationError(`file.doc.${kind}[${i}].id: duplicate id`);
      seen.add(item.id);
    });
  }

  const shapes = new Set(d.shapes.map((s) => s.id));
  d.lines.forEach((l, i) => {
    for (const end of ["from", "to"] as const) {
      const e = l[end];
      if (e.kind === "anchor" && !shapes.has(e.shapeId)) {
        throw new ValidationError(`file.doc.lines[${i}].${end}.shapeId: unknown shape`);
      }
    }
  });

  const lines = new Set(d.lines.map((l) => l.id));
  d.labels.forEach((l, i) => {
    if (!lines.has(l.lineId)) throw new ValidationError(`file.doc.labels[${i}].lineId: unknown line`);
  });

  // Parents must be existing shapes, and following them must end at the top.
  const parentOf = new Map(d.shapes.map((s) => [s.id, s.parentId]));
  const checkParent = (kind: "shapes" | "texts", i: number, parentId: string | null) => {
    if (parentId === null) return;
    if (!shapes.has(parentId)) throw new ValidationError(`file.doc.${kind}[${i}].parentId: unknown shape`);
  };
  d.shapes.forEach((s, i) => {
    checkParent("shapes", i, s.parentId);
    const visited = new Set([s.id]);
    for (let p = s.parentId; p !== null; p = parentOf.get(p) ?? null) {
      if (visited.has(p)) throw new ValidationError(`file.doc.shapes[${i}].parentId: cycle`);
      visited.add(p);
    }
  });
  d.texts.forEach((t, i) => checkParent("texts", i, t.parentId));
}
