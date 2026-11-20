import type { AppContext } from "../context";
import { inflate, type Point, type Rect } from "../core/geometry";
import { setAttrs } from "../core/svg";
import { anchoredBox, tagHeight, tagWidth } from "../layout/text";
import type { HAlign, Item, VAlign } from "../model/types";
import { outline, SELECTION_PADDING } from "../render/overlay";
import { colours, font, fontWeight, textStyle, ui } from "../render/theme";
import { boldToggle, numberField, type Control } from "../ui/floating-bar";
import type { FieldSpec } from "../ui/inline-editor";

/**
 * Shared behaviour of items shown as text in a tag box: line labels and
 * free texts. The box scales with the font size.
 */
export type TagKind = "labels" | "texts";
type TagItem = Item<TagKind>;

/** Where a tag sits: the point its `align`/`valign` side is fixed to. */
export interface TagAnchor {
  readonly point: Point;
  readonly align: HAlign;
  readonly valign: VAlign;
}

/** Room for a few characters while a tag is still short, in em. */
const MIN_EDIT_WIDTH_EM = 6;

export function fontSizeField<T extends TagItem>(ctx: AppContext, kind: TagKind): Control<T> {
  return numberField({
    label: "Font size",
    unit: "px",
    min: textStyle.minFontSize,
    max: textStyle.maxFontSize,
    read: (t) => t.fontSize,
    write: (t, fontSize) => ctx.diagram.update(kind, t.id, { fontSize }),
  });
}

export function tagBoldToggle<T extends TagItem>(ctx: AppContext, kind: TagKind): Control<T> {
  return boldToggle<T>((t, bold) => ctx.diagram.update(kind, t.id, { bold }));
}

export function tagOverlay(box: Rect | null): SVGElement[] {
  return box ? [outline(inflate(box, SELECTION_PADDING), 4)] : [];
}

/**
 * Single line text field on the tag, sized like it and fixed to the same
 * anchor, so it grows the same way the text will. A tag left empty is removed.
 */
export function tagField(ctx: AppContext, kind: TagKind, id: string, anchor: () => TagAnchor | null): FieldSpec {
  const { diagram } = ctx;
  return {
    multiline: false,
    text: () => diagram.get(kind, id)?.text,

    create(text) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "label-editor";
      input.value = text;
      input.spellcheck = false;
      input.setAttribute("aria-label", "Text");
      Object.assign(input.style, { fontFamily: font.mono, color: colours.diagram, borderColor: ui.selection });
      return { root: input, field: input };
    },

    layout(frame, _root, field) {
      const item = diagram.get(kind, id);
      const a = anchor();
      if (!item || !a) return false;

      const { fontSize } = item;
      const value = (field as HTMLInputElement).value;
      const width = Math.max(tagWidth(value, fontSize), MIN_EDIT_WIDTH_EM * fontSize);
      const box = anchoredBox(a.point, width, tagHeight(fontSize), a.align, a.valign);
      field.style.fontSize = `${fontSize}px`;
      field.style.fontWeight = String(fontWeight(item.bold));
      field.style.textAlign = a.align;
      setAttrs(frame, { ...box });
      return true;
    },

    commit: (text) => {
      if (text !== "") {
        diagram.update(kind, id, { text });
        return;
      }
      diagram.remove({ kind, id });
      ctx.selection.set([]);
    },
  };
}
