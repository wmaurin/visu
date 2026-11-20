import { renderIcon } from "./svg";
import type { Tool } from "./tools/tool";

/** Vertical tool palette. Holds no state of its own beyond the pressed button. */
export class Toolbar {
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(host: HTMLElement, tools: readonly Tool[], onSelect: (tool: Tool) => void) {
    for (const tool of tools) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tool";
      button.title = `${tool.label} (${tool.shortcut.toUpperCase()})`;
      button.setAttribute("aria-label", tool.label);
      button.setAttribute("aria-pressed", "false");
      button.append(renderIcon(tool.icon));
      button.addEventListener("click", () => onSelect(tool));

      this.buttons.set(tool.id, button);
      host.append(button);
    }
  }

  setActive(toolId: string): void {
    for (const [id, button] of this.buttons) {
      button.setAttribute("aria-pressed", String(id === toolId));
    }
  }
}
