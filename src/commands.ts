import type { AppContext } from "./context";
import { download, fileName, pickFile, readTextFile } from "./core/files";
import { grid } from "./core/geometry";
import { parseProject, PROJECT_FILE, serializeProject } from "./project/format";
import { toast } from "./ui/toast";
import { copyItems, pasteClip, type Clip } from "./model/clipboard";
import { moveItems } from "./model/move";
import type { Collection, Ref } from "./model/types";

/** A command reports whether it did anything, so the key press is consumed. */
export type Command = () => boolean;

/**
 * Keyboard commands on the selection (Command pattern). The clipboard is
 * internal to the app on purpose, so foreign clipboard content is never
 * read or parsed.
 */
export function createCommands({ diagram, history, selection, editor, projectName }: AppContext) {
  let clipboard: Clip | null = null;
  /** Pastes since the last copy. Each one lands one grid step further. */
  let pastes = 0;

  /** Removes every selected item. Items already gone with a removed container are skipped. */
  const deleteSelection: Command = () => {
    const refs = selection.get();
    if (refs.length === 0) return false;
    diagram.batch(() => refs.forEach((ref) => diagram.remove(ref)));
    selection.set([]);
    return true;
  };

  const copy: Command = () => {
    const clip = copyItems(diagram.doc, selection.get());
    if (!clip) return false;
    clipboard = clip;
    pastes = 0;
    return true;
  };

  const paste: Command = () => {
    if (!clipboard) return false;
    pastes += 1;
    selection.set(pasteClip(diagram, clipboard, pastes * grid()));
    return true;
  };

  const cut: Command = () => copy() && deleteSelection();

  /** Copies the selection in place, one grid step down and right. Leaves the clipboard alone. */
  const duplicate: Command = () => {
    const clip = copyItems(diagram.doc, selection.get());
    if (!clip) return false;
    selection.set(pasteClip(diagram, clip, grid()));
    return true;
  };

  /** Selects every item. Labels stay out, they belong to their lines. */
  const selectAll: Command = () => {
    const doc = diagram.doc;
    const kinds = (Object.keys(doc) as Collection[]).filter((kind) => kind !== "labels");
    selection.set(kinds.flatMap((kind) => doc[kind].map((item): Ref => ({ kind, id: item.id }))));
    return true;
  };

  /** Moves the selection by whole grid steps. Each press is one undo step. */
  const nudge =
    (dx: number, dy: number): Command =>
    () => {
      const selected = selection.get();
      if (selected.length === 0) return false;
      const move = moveItems(diagram, selected);
      diagram.batch(() => {
        move.to(dx * grid(), dy * grid());
        move.settle();
      });
      return true;
    };

  /** Undo and redo drop selected items that no longer exist. */
  const pruneSelection = () => {
    selection.set(selection.get().filter((ref) => diagram.get(ref.kind, ref.id)));
  };

  const undo: Command = () => {
    if (!history.undo()) return false;
    pruneSelection();
    return true;
  };

  const redo: Command = () => {
    if (!history.redo()) return false;
    pruneSelection();
    return true;
  };

  const clearSelection: Command = () => {
    if (selection.get().length === 0) return false;
    selection.set([]);
    return true;
  };

  /** Saves the project under its name, e.g. "Projekt_Eins.visu.json". */
  const exportProject: Command = () => {
    const name = projectName.get();
    const file = fileName(name, PROJECT_FILE.extension);
    download(file, serializeProject({ name, doc: diagram.doc }), PROJECT_FILE.type);
    toast(`Exported ${file}.`);
    return true;
  };

  /** Replaces the diagram with a project file. A file that fails validation changes nothing. */
  const importProject: Command = () => {
    void (async () => {
      const file = await pickFile(PROJECT_FILE.accept);
      if (!file) return;
      try {
        const project = parseProject(await readTextFile(file, PROJECT_FILE.maxBytes));
        const hasContent = Object.values(diagram.doc).some((items) => items.length > 0);
        // Nothing is saved automatically yet, so replacing needs consent.
        if (hasContent && !window.confirm("Replace the current diagram with the imported project?")) return;
        editor.close();
        selection.set([]);
        diagram.restore(project.doc);
        // An import starts a new document, its history does not reach back.
        history.reset();
        projectName.set(project.name);
        toast(`Imported ${file.name}.`);
      } catch (error) {
        toast(error instanceof Error ? error.message : "The file could not be imported.", "error");
      }
    })();
    return true;
  };

  return {
    deleteSelection,
    copy,
    cut,
    paste,
    duplicate,
    selectAll,
    nudge,
    undo,
    redo,
    clearSelection,
    exportProject,
    importProject,
  };
}
