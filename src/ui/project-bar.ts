import type { Observable } from "../core/observable";
import { renderIcon, type IconDef } from "../core/svg";

export interface ProjectActions {
  importProject(): unknown;
  exportProject(): unknown;
}

// Lucide "upload" and "download"
const UPLOAD: IconDef = [["path", { d: "M12 3v12M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5" }]];
const DOWNLOAD: IconDef = [["path", { d: "M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" }]];

/**
 * Floating bar in the top left corner: import and export of the project
 * file, and the project name, which also names the exported file.
 */
export function projectBar(host: HTMLElement, actions: ProjectActions, name: Observable<string>): void {
  const bar = document.createElement("div");
  bar.className = "project-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Project");

  const items: Array<[string, IconDef, () => unknown]> = [
    ["Import project (Ctrl+O)", UPLOAD, () => actions.importProject()],
    ["Export project (Ctrl+S)", DOWNLOAD, () => actions.exportProject()],
  ];
  for (const [label, icon, run] of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tool";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.append(renderIcon(icon));
    button.addEventListener("click", run);
    bar.append(button);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "project-name";
  input.maxLength = 200;
  input.spellcheck = false;
  input.placeholder = "Project name";
  input.setAttribute("aria-label", "Project name");
  input.addEventListener("input", () => {
    name.set(input.value);
    fit();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") input.blur();
  });
  // Follows imports, but never overwrites what is being typed.
  const sync = () => {
    if (document.activeElement !== input) input.value = name.get();
    fit();
  };

  /**
   * Grows the field with the name, so the whole name stays visible, up to
   * a limit. Beyond it the text scrolls and the tooltip shows it in full.
   */
  const measure = document.createElement("canvas").getContext("2d");
  function fit(): void {
    input.title = input.value;
    if (!measure || !input.isConnected) return;
    const style = getComputedStyle(input);
    measure.font = style.font;
    const chrome =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight) +
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.borderRightWidth);
    // A little slack, so the caret after the last character still fits.
    const text = measure.measureText(input.value || input.placeholder).width + chrome + 4;
    input.style.width = `${Math.min(Math.max(text, NAME_MIN_WIDTH), NAME_MAX_WIDTH)}px`;
  }

  bar.append(input);
  host.append(bar);
  name.subscribe(sync);
  sync();
}

/** Width limits of the project name field, in px. */
const NAME_MIN_WIDTH = 120;
const NAME_MAX_WIDTH = 400;
