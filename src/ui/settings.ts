import { renderIcon, type IconDef } from "../core/svg";

export interface SettingsCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: IconDef;
}

// Lucide "settings"
const GEAR: IconDef = [
  [
    "path",
    {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    },
  ],
  ["circle", { cx: 12, cy: 12, r: 3 }],
];

/**
 * Settings button in the bottom left corner. Opens a panel with categories
 * on the left and the selected category on the right. Closes on a click
 * outside, on Escape and on the button.
 */
export class SettingsMenu {
  private readonly trigger: HTMLButtonElement;
  private readonly panel = document.createElement("div");
  private readonly content = document.createElement("section");
  private readonly items: Array<{ category: SettingsCategory; button: HTMLButtonElement }>;

  constructor(host: HTMLElement, categories: readonly SettingsCategory[]) {
    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "tool";
    this.trigger.title = "Settings";
    this.trigger.setAttribute("aria-label", "Settings");
    this.trigger.setAttribute("aria-haspopup", "dialog");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.append(renderIcon(GEAR));
    this.trigger.addEventListener("click", () => (this.panel.hidden ? this.open() : this.close()));

    const nav = document.createElement("nav");
    nav.className = "settings-nav";
    nav.setAttribute("aria-label", "Settings categories");
    this.items = categories.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-category";
      const label = document.createElement("span");
      label.textContent = category.label;
      button.append(renderIcon(category.icon), label);
      button.addEventListener("click", () => this.show(category));
      nav.append(button);
      return { category, button };
    });

    const title = document.createElement("h2");
    title.className = "settings-title";
    title.textContent = "Settings";

    const body = document.createElement("div");
    body.className = "settings-body";
    this.content.className = "settings-content";
    body.append(nav, this.content);

    this.panel.className = "settings-panel";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "Settings");
    this.panel.hidden = true;
    this.panel.append(title, body);

    const dock = document.createElement("div");
    dock.className = "settings";
    dock.append(this.panel, this.trigger);
    dock.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || this.panel.hidden) return;
      // Closes the panel only, without reaching the editor shortcuts.
      event.stopPropagation();
      this.close();
      this.trigger.focus();
    });
    host.append(dock);

    const first = categories[0];
    if (first) this.show(first);
  }

  private readonly onOutside = (event: PointerEvent) => {
    if (!this.panel.parentElement?.contains(event.target as Node)) this.close();
  };

  private open(): void {
    this.panel.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", this.onOutside, true);
  }

  private close(): void {
    this.panel.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.onOutside, true);
  }

  private show(category: SettingsCategory): void {
    for (const { category: c, button } of this.items) {
      button.setAttribute("aria-current", String(c === category));
    }

    const heading = document.createElement("h3");
    heading.textContent = category.label;
    const empty = document.createElement("p");
    empty.className = "settings-empty";
    empty.textContent = "No settings yet.";
    this.content.replaceChildren(heading, empty);
  }
}
