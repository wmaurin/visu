import type { Observable } from "../core/observable";
import type { Diagram } from "../model/diagram";
import type { Settings } from "../settings";
import { toast } from "../ui/toast";
import { parseProject, serializeProject, type Project } from "./format";

const KEY = "visu.project";
/** Where a stored project that fails validation is kept, so it is never lost silently. */
const BROKEN_KEY = "visu.project.broken";
/** Quiet time after the last change before saving. */
const DELAY_MS = 500;

/**
 * The project kept in this browser, or null when there is none. Stored
 * data is treated like an imported file: anything else could have
 * written to it, so it goes through the same validation. A copy that
 * fails is moved aside and reported.
 */
export function loadStoredProject(): Project | null {
  let text: string | null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    // Storage blocked, e.g. by browser settings.
    return null;
  }
  if (text === null) return null;
  try {
    return parseProject(text);
  } catch (error) {
    try {
      localStorage.setItem(BROKEN_KEY, text);
      localStorage.removeItem(KEY);
    } catch {
      // Left where it is. The next save replaces it.
    }
    const reason = error instanceof Error ? error.message : "unknown error";
    toast(`The stored diagram could not be restored (${reason}). A copy was kept.`, "error");
    return null;
  }
}

interface Sources {
  readonly diagram: Diagram;
  readonly projectName: Observable<string>;
  readonly settings: Observable<Settings>;
}

/**
 * Saves the project to this browser shortly after every change, and at
 * once when the page is hidden or closed. Turning the setting off deletes
 * the stored copy. With it off, leaving a page with content asks first.
 */
export function autosave({ diagram, projectName, settings }: Sources): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Each problem is reported once, until saving works again. */
  let failing = false;
  let overwritten = false;
  /** What this tab wrote last. Tells its own writes apart from other tabs'. */
  let written: string | null = null;

  const enabled = () => settings.get().autosave;
  const hasContent = () => Object.values(diagram.doc).some((items) => items.length > 0);

  const save = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!enabled()) return;
    const text = serializeProject({ name: projectName.get(), doc: diagram.doc });
    if (text === written) return;
    try {
      localStorage.setItem(KEY, text);
      written = text;
      failing = false;
      overwritten = false;
    } catch {
      // Usually the storage quota. The diagram itself is unaffected.
      if (!failing) toast("The diagram could not be saved in this browser. Export it to keep it.", "error");
      failing = true;
    }
  };

  const schedule = () => {
    if (!enabled()) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(save, DELAY_MS);
  };

  diagram.subscribe(schedule);
  projectName.subscribe(schedule);

  let wasEnabled = enabled();
  settings.subscribe(() => {
    if (enabled() === wasEnabled) return;
    wasEnabled = enabled();
    if (wasEnabled) {
      save();
      return;
    }
    if (timer !== null) clearTimeout(timer);
    timer = null;
    written = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored that could be removed.
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
  window.addEventListener("pagehide", save);

  window.addEventListener("beforeunload", (event) => {
    // Without autosave, a reload would lose the diagram.
    if (!enabled() && hasContent()) event.preventDefault();
  });

  // Another tab of visu saved. Whoever saves last wins, so say so once.
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY || event.newValue === null || event.newValue === written || !enabled()) return;
    if (!overwritten) toast("visu saved in another tab. Changes here will replace that version.", "error");
    overwritten = true;
  });
}
