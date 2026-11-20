import { renderIcon, type IconDef } from "../core/svg";

export interface ProjectActions {
  importProject(): unknown;
  exportProject(): unknown;
}

// Lucide "upload" and "download"
const UPLOAD: IconDef = [["path", { d: "M12 3v12M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5" }]];
const DOWNLOAD: IconDef = [["path", { d: "M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" }]];

/** Floating bar in the top left corner to import and export the project file. */
export function projectBar(host: HTMLElement, actions: ProjectActions): void {
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
  host.append(bar);
}
