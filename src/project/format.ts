import { arr, bool, nullable, num, obj, oneOf, str, ValidationError, type Check } from "../core/validate";
import {
  COLOR_NAMES,
  type Doc,
  type Endpoint,
  type ExportFrame,
  type FreeText,
  type LineLabel,
  type LineShape,
  type RectShape,
} from "../model/types";
import { textStyle } from "../render/theme";

/**
 * Project file format: the whole document as versioned JSON.
 *
 *   { "format": "visu", "version": 1, "name": "…", "doc": { shapes, lines, labels, texts, frames } }
 *
 * Imported files are untrusted. Every field is checked, unknown fields are
 * dropped, and references between items must resolve.
 */

const FORMAT = "visu";
const VERSION = 1;

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
const TEXT_COLOR = oneOf("black", "white");
const COLOR = oneOf(...COLOR_NAMES);
const SATURATION = num(0, 100);

const rect = obj<RectShape>({
  id: ID,
  kind: oneOf("rect"),
  x: COORD,
  y: COORD,
  width: SIZE,
  height: SIZE,
  text: str(MAX_TEXT),
  align: H_ALIGN,
  valign: V_ALIGN,
  fontSize: FONT_SIZE,
  bold: bool,
  textColor: TEXT_COLOR,
  color: COLOR,
  saturation: SATURATION,
  parentId: PARENT,
});

const anchorEnd = obj<Extract<Endpoint, { kind: "anchor" }>>({
  kind: oneOf("anchor"),
  shapeId: ID,
  side: oneOf("n", "e", "s", "w"),
  offset: num(0, 1_000_000),
});
const freeEnd = obj<Extract<Endpoint, { kind: "free" }>>({ kind: oneOf("free"), x: COORD, y: COORD });
const endpoint: Check<Endpoint> = (v, path) =>
  (v as { kind?: unknown } | null)?.kind === "anchor" ? anchorEnd(v, path) : freeEnd(v, path);

const line = obj<LineShape>({
  id: ID,
  from: endpoint,
  to: endpoint,
  routing: oneOf("straight", "orthogonal"),
  style: oneOf("solid", "dashed"),
  color: COLOR,
  saturation: SATURATION,
  startCap: CAP,
  endCap: CAP,
});

const label = obj<LineLabel>({ id: ID, lineId: ID, text: str(MAX_TEXT), t: num(0, 1), fontSize: FONT_SIZE, bold: bool, textColor: TEXT_COLOR });

const text = obj<FreeText>({
  id: ID,
  x: COORD,
  y: COORD,
  text: str(MAX_TEXT),
  fontSize: FONT_SIZE,
  bold: bool,
  textColor: TEXT_COLOR,
  align: H_ALIGN,
  valign: V_ALIGN,
  parentId: PARENT,
});

const frame = obj<ExportFrame>({ id: ID, x: COORD, y: COORD, width: SIZE, height: SIZE, name: str(200) });

const doc = obj<Doc>({
  shapes: arr(rect, MAX_ITEMS),
  lines: arr(line, MAX_ITEMS),
  labels: arr(label, MAX_ITEMS),
  texts: arr(text, MAX_ITEMS),
  frames: arr(frame, MAX_ITEMS),
});

/** A project: its name and the diagram. */
export interface Project {
  readonly name: string;
  readonly doc: Doc;
}

const file = obj<{ format: string; version: number; name: string; doc: Doc }>({
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
  const { name, doc: d } = file(input, "file");
  checkReferences(d);
  return { name, doc: d };
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
