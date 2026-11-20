import type { AppContext } from "./context";
import { download, pickFile, readTextFile } from "./core/files";
import { grid } from "./core/geometry";
import { parseProject, PROJECT_FILE, serializeProject } from "./project/format";
import { toast } from "./ui/toast";
import { newId } from "./model/diagram";
import type { FreeText, Shape } from "./model/types";

/** A command reports whether it did anything, so the key press is consumed. */
export type Command = () => boolean;

/** Items that can be copied: free standing ones, positioned by x and y. */
type Copied = { readonly kind: "shapes"; readonly item: Shape } | { readonly kind: "texts"; readonly item: FreeText };

/**
 * Keyboard commands on the selection (Command pattern). The clipboard is
 * internal to the app on purpose, so foreign clipboard content is never
 * read or parsed.
 */
export function createCommands({ diagram, selection, editor }: AppContext) {
  /** Snapshot taken on copy. Later edits to the original do not affect it. */
  let clipboard: Copied | null = null;
  /** Pastes since the last copy. Each one lands one grid step further. */
  let pastes = 0;

  const deleteSelection: Command = () => {
    const ref = selection.get();
    if (!ref) return false;
    diagram.remove(ref);
    selection.set(null);
    return true;
  };

  const copy: Command = () => {
    const ref = selection.get();
    if (ref?.kind !== "shapes" && ref?.kind !== "texts") return false;
    const item = diagram.get(ref.kind, ref.id);
    if (!item) return false;
    clipboard = { kind: ref.kind, item } as Copied;
    pastes = 0;
    return true;
  };

  const paste: Command = () => {
    if (!clipboard) return false;
    pastes += 1;
    const offset = pastes * grid();
    const { kind, item } = clipboard;
    const id = newId();
    const moved = { ...item, id, x: item.x + offset, y: item.y + offset };
    if (kind === "shapes") diagram.add(kind, moved as Shape);
    else diagram.add(kind, moved as FreeText);
    selection.set({ kind, id });
    return true;
  };

  const clearSelection: Command = () => {
    if (!selection.get()) return false;
    selection.set(null);
    return true;
  };

  const exportProject: Command = () => {
    download(PROJECT_FILE.name, serializeProject(diagram.doc), PROJECT_FILE.type);
    toast(`Exported ${PROJECT_FILE.name}.`);
    return true;
  };

  /** Replaces the diagram with a project file. A file that fails validation changes nothing. */
  const importProject: Command = () => {
    void (async () => {
      const file = await pickFile(PROJECT_FILE.accept);
      if (!file) return;
      try {
        const doc = parseProject(await readTextFile(file, PROJECT_FILE.maxBytes));
        const hasContent = Object.values(diagram.doc).some((items) => items.length > 0);
        // Nothing is saved automatically yet, so replacing needs consent.
        if (hasContent && !window.confirm("Replace the current diagram with the imported project?")) return;
        editor.close();
        selection.set(null);
        diagram.restore(doc);
        toast(`Imported ${file.name}.`);
      } catch (error) {
        toast(error instanceof Error ? error.message : "The file could not be imported.", "error");
      }
    })();
    return true;
  };

  return { deleteSelection, copy, paste, clearSelection, exportProject, importProject };
}
