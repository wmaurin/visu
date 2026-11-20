import type { AppContext } from "./context";
import { GRID } from "./core/geometry";
import { newId } from "./model/diagram";
import type { Shape } from "./model/types";

/** A command reports whether it did anything, so the key press is consumed. */
export type Command = () => boolean;

/**
 * Keyboard commands on the selection (Command pattern). The clipboard is
 * internal to the app on purpose, so foreign clipboard content is never
 * read or parsed.
 */
export function createCommands({ diagram, selection }: AppContext) {
  /** Snapshot taken on copy. Later edits to the original do not affect it. */
  let clipboard: Shape | null = null;
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
    const shape = ref?.kind === "shapes" ? diagram.get("shapes", ref.id) : undefined;
    if (!shape) return false;
    clipboard = shape;
    pastes = 0;
    return true;
  };

  const paste: Command = () => {
    if (!clipboard) return false;
    pastes += 1;
    const id = newId();
    const offset = pastes * GRID;
    diagram.add("shapes", { ...clipboard, id, x: clipboard.x + offset, y: clipboard.y + offset });
    selection.set({ kind: "shapes", id });
    return true;
  };

  const clearSelection: Command = () => {
    if (!selection.get()) return false;
    selection.set(null);
    return true;
  };

  return { deleteSelection, copy, paste, clearSelection };
}
