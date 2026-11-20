import { download, pickFile, readTextFile } from "../core/files";
import type { Observable } from "../core/observable";
import { renderIcon, type IconDef } from "../core/svg";
import { exportSettings, importSettings, SETTINGS_FILE, type Settings } from "../settings";
import { toast } from "./toast";

export interface SettingsCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: IconDef;
  /** Controls shown for the category, e.g. from `rangeSetting`. */
  readonly controls?: readonly HTMLElement[];
}

/** A setting as a control sees it: current value, change, change notice. */
export interface SettingBinding<V> {
  read(): V;
  write(value: V): void;
  subscribe(listener: () => void): unknown;
}

export interface RangeSpec {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
}

/** Slider with label and current value. Follows the setting, also when changed elsewhere. */
export function rangeSetting(spec: RangeSpec, binding: SettingBinding<number>): HTMLElement {
  const input = document.createElement("input");
  Object.assign(input, { type: "range", min: spec.min, max: spec.max, step: 1 });
  input.setAttribute("aria-label", spec.label);

  const name = document.createElement("span");
  name.textContent = spec.label;
  const value = document.createElement("output");

  const sync = () => {
    input.value = String(binding.read());
    value.textContent = `${binding.read()} ${spec.unit}`;
  };
  input.addEventListener("input", () => binding.write(Number(input.value)));
  binding.subscribe(sync);
  sync();

  const head = document.createElement("div");
  head.className = "setting-head";
  head.append(name, value);

  const row = document.createElement("label");
  row.className = "setting";
  row.append(head, input);
  return row;
}

// Lucide "upload" and "download"
const UPLOAD: IconDef = [["path", { d: "M12 3v12M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5" }]];
const DOWNLOAD: IconDef = [["path", { d: "M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" }]];

/** Import and export of the settings as a JSON file. The outcome shows as a toast. */
export function settingsFileActions(store: Observable<Settings>): HTMLElement {
  const importButton = textButton("Import settings", UPLOAD, async () => {
    const file = await pickFile(SETTINGS_FILE.accept);
    if (!file) return;
    try {
      const rejected = importSettings(store, await readTextFile(file, SETTINGS_FILE.maxBytes));
      if (rejected.length === 0) toast("Settings imported.");
      else toast(`Settings imported. Skipped invalid values: ${rejected.join(", ")}.`, "error");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The file could not be imported.", "error");
    }
  });
  const exportButton = textButton("Export settings", DOWNLOAD, () => {
    download(SETTINGS_FILE.name, exportSettings(store), SETTINGS_FILE.type);
    toast(`Exported ${SETTINGS_FILE.name}.`);
  });

  const footer = document.createElement("footer");
  footer.className = "settings-footer";
  footer.append(importButton, exportButton);
  return footer;
}

function textButton(label: string, icon: IconDef, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-button";
  const text = document.createElement("span");
  text.textContent = label;
  button.append(renderIcon(icon), text);
  button.addEventListener("click", onClick);
  return button;
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

  /** `footer` sits below both columns, e.g. for import and export. */
  constructor(host: HTMLElement, categories: readonly SettingsCategory[], footer?: HTMLElement) {
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
    if (footer) this.panel.append(footer);

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
    if (category.controls?.length) {
      this.content.replaceChildren(heading, ...category.controls);
      return;
    }
    const empty = document.createElement("p");
    empty.className = "settings-empty";
    empty.textContent = "No settings yet.";
    this.content.replaceChildren(heading, empty);
  }
}
