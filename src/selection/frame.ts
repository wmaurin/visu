import type { AppContext } from "../context";
import { setAttrs } from "../core/svg";
import { download } from "../core/files";
import { exportSvg } from "../export/svg";
import { textWidth } from "../layout/text";
import { FRAME_TITLE_SIZE, frameTitleBox } from "../model/queries";
import type { ExportFrame } from "../model/types";
import { colours, font, ui } from "../render/theme";
import { action, FloatingBar } from "../ui/floating-bar";
import type { FieldSpec } from "../ui/inline-editor";
import { toast } from "../ui/toast";
import { boxBehaviour } from "./box";
import type { Handler } from "./handler";

/** Room for a few characters while a name is still short. */
const MIN_NAME_WIDTH = 80;
/** Inner padding of the name field, left and right together. */
const NAME_FIELD_PADDING = 16;

/** Export frames: move and resize like boxes, rename by double-click, export from the bar. */
export function frameHandler(ctx: AppContext): Handler<ExportFrame> {
  return {
    ...boxBehaviour<ExportFrame>(ctx, "frames"),
    cursor: "move",
    bar: new FloatingBar<ExportFrame>(ctx.canvas, "Export", [
      // Lucide "download"
      action("Export SVG", [["path", { d: "M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" }]], (f) => {
        const name = fileName(f.name, "svg");
        download(name, exportSvg(ctx.diagram.doc, f), "image/svg+xml");
        toast(`Exported ${name}.`);
      }),
    ]),
    doubleClick: (f) => ctx.editor.open({ kind: "frames", id: f.id }, nameField(ctx, f.id)),
  };
}

/** Edits the name in place, over the title. An empty name keeps the old one. */
function nameField(ctx: AppContext, id: string): FieldSpec {
  const { diagram } = ctx;
  return {
    multiline: false,
    text: () => diagram.get("frames", id)?.name,

    create(text) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "label-editor";
      input.value = text;
      input.spellcheck = false;
      input.setAttribute("aria-label", "Frame name");
      Object.assign(input.style, {
        fontFamily: font.sans,
        fontSize: `${FRAME_TITLE_SIZE}px`,
        color: colours.ink2,
        borderColor: ui.selection,
        textAlign: "left",
      });
      return { root: input, field: input };
    },

    layout(frame, _root, field) {
      const f = diagram.get("frames", id);
      if (!f) return false;
      const title = frameTitleBox(f);
      const value = (field as HTMLInputElement).value;
      const width = Math.max(textWidth(value, FRAME_TITLE_SIZE) + NAME_FIELD_PADDING, MIN_NAME_WIDTH);
      // The field's padding would shift the text right, so start it that much earlier.
      setAttrs(frame, { x: title.x - NAME_FIELD_PADDING / 2, y: title.y, width, height: title.height });
      return true;
    },

    commit: (name) => {
      if (name !== "") diagram.update("frames", id, { name });
    },
  };
}

/**
 * File name from a frame name. Drops characters that are not allowed in
 * file names on common systems, falls back to "diagram".
 */
function fileName(name: string, extension: string): string {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return `${safe || "diagram"}.${extension}`;
}
