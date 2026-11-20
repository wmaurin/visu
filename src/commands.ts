import type { AppContext } from "./context";
import { download, fileName, pickFile, readTextFile } from "./core/files";
import { grid } from "./core/geometry";
import { parseProject, PROJECT_FILE, serializeProject } from "./project/format";
import { toast } from "./ui/toast";
import { copyItems, pasteClip, type Clip } from "./model/clipboard";

/** A command reports whether it did anything, so the key press is consumed. */
export type Command = () => boolean;

/**
 * Keyboard commands on the selection (Command pattern). The clipboard is
 * internal to the app on purpose, so foreign clipboard content is never
 * read or parsed.
 */
export function createCommands({ diagram, selection, editor, projectName }: AppContext) {
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
        projectName.set(project.name);
        toast(`Imported ${file.name}.`);
      } catch (error) {
        toast(error instanceof Error ? error.message : "The file could not be imported.", "error");
      }
    })();
    return true;
  };

  return { deleteSelection, copy, paste, clearSelection, exportProject, importProject };
}
