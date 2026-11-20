import type { AppContext } from "../context";
import { inflate, type Point, type Rect } from "../core/geometry";
import { setAttrs } from "../core/svg";
import { tagHeight, tagWidth } from "../layout/text";
import type { Item } from "../model/types";
import { outline, SELECTION_PADDING } from "../render/overlay";
import { colours, font, textStyle, ui } from "../render/theme";
import { FloatingBar, numberField } from "../ui/floating-bar";
import type { FieldSpec } from "../ui/inline-editor";

/**
 * Shared behaviour of items shown as text in a framed tag: line labels and
 * free texts. The tag scales with the font size.
 */
export type TagKind = "labels" | "texts";
type TagItem = Item<TagKind>;

/** Room for a few characters while a tag is still short, in em. */
const MIN_EDIT_WIDTH_EM = 6;

export function tagBar<T extends TagItem>(ctx: AppContext, kind: TagKind): FloatingBar<T> {
  return new FloatingBar<T>(ctx.canvas, "Text format", [
    numberField({
      label: "Font size",
      unit: "px",
      min: textStyle.minFontSize,
      max: textStyle.maxFontSize,
      read: (t) => t.fontSize,
      write: (t, fontSize) => ctx.diagram.update(kind, t.id, { fontSize }),
    }),
  ]);
}

export function tagOverlay(box: Rect | null): SVGElement[] {
  return box ? [outline(inflate(box, SELECTION_PADDING), 4)] : [];
}

/**
 * Single line text field centred on the tag, sized like it. It grows with
 * its content. A tag left empty is removed.
 */
export function tagField(ctx: AppContext, kind: TagKind, id: string, centre: () => Point | null): FieldSpec {
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
      Object.assign(input.style, { fontFamily: font.mono, color: colours.ink2, borderColor: ui.selection });
      return { root: input, field: input };
    },

    layout(frame, _root, field) {
      const item = diagram.get(kind, id);
      const c = centre();
      if (!item || !c) return false;

      const { fontSize } = item;
      const value = (field as HTMLInputElement).value;
      const width = Math.max(tagWidth(value, fontSize), MIN_EDIT_WIDTH_EM * fontSize);
      const height = tagHeight(fontSize);
      field.style.fontSize = `${fontSize}px`;
      setAttrs(frame, { x: c.x - width / 2, y: c.y - height / 2, width, height });
      return true;
    },

    commit: (text) => {
      if (text !== "") {
        diagram.update(kind, id, { text });
        return;
      }
      diagram.remove({ kind, id });
      ctx.selection.set(null);
    },
  };
}
