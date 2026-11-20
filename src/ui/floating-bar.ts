import type { Rect } from "../core/geometry";
import { renderIcon, type IconDef } from "../core/svg";
import { COLOR_NAMES, type ColorName, type TextColor } from "../model/types";
import { PALETTE, tint } from "../render/theme";
import type { Canvas } from "./canvas";

/** Distance between a bar and its target. Clears the selection handles. */
const GAP = 12;
/** Minimum distance between a bar and the canvas edge. */
const EDGE = 8;

/** One element in a bar. `sync` shows the state of the current item. */
export interface BarControl<T> {
  readonly el: HTMLElement;
  sync(item: T): void;
  /** Closes any popup the control has open. Called when the bar hides. */
  close?(): void;
}

/** Builds a control. `current` returns the item the bar is showing. */
export type Control<T> = (current: () => T | null) => BarControl<T>;

export interface Choice<V> {
  readonly value: V;
  readonly label: string;
  readonly icon: IconDef;
}

/**
 * Floating toolbar above an item. Declared as a list of controls, so a new
 * bar is configuration only. Controls are separated by dividers.
 */
export class FloatingBar<T> {
  private readonly el = document.createElement("div");
  private readonly controls: BarControl<T>[] = [];
  private item: T | null = null;

  constructor(
    private readonly canvas: Canvas,
    label: string,
    controls: ReadonlyArray<Control<T>>,
  ) {
    this.el.className = "floating-bar";
    this.el.setAttribute("role", "toolbar");
    this.el.setAttribute("aria-label", label);
    this.el.hidden = true;

    controls.forEach((make, i) => {
      if (i > 0) this.el.append(divider());
      const control = make(() => this.item);
      this.controls.push(control);
      this.el.append(control.el);
    });
    canvas.host.append(this.el);
  }

  show(item: T, box: Rect): void {
    this.item = item;
    for (const control of this.controls) control.sync(item);
    this.el.hidden = false;
    this.place(box);
  }

  hide(): void {
    this.item = null;
    this.el.hidden = true;
    for (const control of this.controls) control.close?.();
  }

  /** Centred above `box`, or below it when there is no room above. */
  private place(box: Rect): void {
    const top = this.canvas.toHost({ x: box.x + box.width / 2, y: box.y });
    const bottom = this.canvas.toHost({ x: box.x, y: box.y + box.height });
    const { offsetWidth: w, offsetHeight: h } = this.el;

    let y = top.y - GAP - h;
    if (y < EDGE) y = bottom.y + GAP;
    const x = Math.min(Math.max(top.x - w / 2, EDGE), this.canvas.host.clientWidth - w - EDGE);

    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }
}

// Lucide "chevron-down"
const CHEVRON: IconDef = [["path", { d: "m6 9 6 6 6-6" }]];

/**
 * Dropdown for one property of the item. The trigger shows the icon of the
 * current value, the menu lists all options. Neither takes focus on click,
 * so an open inline editor stays open.
 */
export function dropdown<T, V>(
  label: string,
  options: ReadonlyArray<Choice<V>>,
  read: (item: T) => V,
  write: (item: T, value: V) => void,
): Control<T> {
  return (current) => {
    const trigger = button("tool dropdown-trigger");
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", label);
    const currentIcon = document.createElement("span");
    currentIcon.className = "dropdown-value";
    trigger.append(currentIcon, renderIcon(CHEVRON));

    const menu = document.createElement("div");
    menu.className = "dropdown-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);

    const wrapper = document.createElement("div");
    wrapper.className = "dropdown";
    wrapper.append(trigger, menu);
    const { close } = popover(wrapper, trigger, menu);

    const items = options.map((option) => {
      const item = button("dropdown-item");
      item.setAttribute("role", "menuitemradio");
      const text = document.createElement("span");
      text.textContent = option.label;
      item.append(renderIcon(option.icon), text);
      item.addEventListener("click", () => {
        const target = current();
        if (target) write(target, option.value);
        close();
      });
      menu.append(item);
      return { option, item };
    });

    return {
      el: wrapper,
      close,
      sync: (item) => {
        const value = read(item);
        const selected = options.find((o) => o.value === value);
        currentIcon.replaceChildren(...(selected ? [renderIcon(selected.icon)] : []));
        trigger.title = selected ? `${label}: ${selected.label}` : label;
        for (const { option, item: el } of items) {
          el.setAttribute("aria-checked", String(option.value === value));
        }
      },
    };
  };
}

/**
 * Makes `panel` a popup of `trigger`: the trigger toggles it, a click
 * outside `wrapper` and Escape close it. Escape is kept from the editor
 * shortcuts, so it never clears the selection at the same time.
 */
function popover(wrapper: HTMLElement, trigger: HTMLButtonElement, panel: HTMLElement): { close(): void } {
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");

  const onOutside = (event: PointerEvent) => {
    if (!wrapper.contains(event.target as Node)) close();
  };
  function open(): void {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside, true);
  }
  function close(): void {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
  }

  trigger.addEventListener("click", () => (panel.hidden ? open() : close()));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.stopPropagation();
    close();
  });
  return { close };
}

export interface ColorValue {
  readonly color: ColorName;
  readonly saturation: number;
}

/**
 * Colour picker: the trigger shows the current colour, the panel holds one
 * swatch per palette colour and a saturation slider. Both apply live.
 */
export function colorField<T>(
  label: string,
  read: (item: T) => ColorValue,
  write: (item: T, value: Partial<ColorValue>) => void,
): Control<T> {
  return (current) => {
    const trigger = button("tool dropdown-trigger");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-label", label);
    const preview = document.createElement("span");
    preview.className = "color-preview";
    trigger.append(preview, renderIcon(CHEVRON));

    const swatches = COLOR_NAMES.map((name) => {
      const swatch = button("color-swatch");
      swatch.title = name;
      swatch.setAttribute("aria-label", name);
      swatch.style.background = PALETTE[name];
      swatch.addEventListener("click", () => {
        const item = current();
        if (item) write(item, { color: name });
      });
      return { name, swatch };
    });
    const grid = document.createElement("div");
    grid.className = "color-grid";
    grid.append(...swatches.map((s) => s.swatch));

    const slider = document.createElement("input");
    Object.assign(slider, { type: "range", min: 0, max: 100, step: 1 });
    slider.setAttribute("aria-label", "Saturation");
    slider.addEventListener("input", () => {
      const item = current();
      if (item) write(item, { saturation: Number(slider.value) });
    });
    const sliderValue = document.createElement("output");
    const sliderHead = document.createElement("div");
    sliderHead.className = "setting-head";
    const sliderLabel = document.createElement("span");
    sliderLabel.textContent = "Saturation";
    sliderHead.append(sliderLabel, sliderValue);
    const sliderRow = document.createElement("label");
    sliderRow.className = "setting";
    sliderRow.append(sliderHead, slider);

    const panel = document.createElement("div");
    panel.className = "dropdown-menu color-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", label);
    panel.append(grid, sliderRow);

    const wrapper = document.createElement("div");
    wrapper.className = "dropdown";
    wrapper.append(trigger, panel);
    const { close } = popover(wrapper, trigger, panel);

    return {
      el: wrapper,
      close,
      sync: (item) => {
        const { color, saturation } = read(item);
        preview.style.background = tint(color, saturation);
        preview.style.borderColor = PALETTE[color];
        trigger.title = `${label}: ${color}, ${saturation} %`;
        for (const { name, swatch } of swatches) swatch.setAttribute("aria-pressed", String(name === color));
        // Never move the slider under the user's hand.
        if (document.activeElement !== slider) slider.value = String(saturation);
        sliderValue.textContent = `${saturation} %`;
      },
    };
  };
}

/** On/off button for a yes/no property of the item, e.g. bold. */
export function toggle<T>(
  label: string,
  icon: IconDef,
  read: (item: T) => boolean,
  write: (item: T, value: boolean) => void,
): Control<T> {
  return (current) => {
    const el = button("tool");
    el.title = label;
    el.setAttribute("aria-label", label);
    el.append(renderIcon(icon));
    el.addEventListener("click", () => {
      const item = current();
      if (item) write(item, !read(item));
    });
    return { el, sync: (item) => el.setAttribute("aria-pressed", String(read(item))) };
  };
}

// Lucide "bold"
const BOLD_ICON: IconDef = [
  ["path", { d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" }],
];

/** Bold on or off for the whole text of an item. */
export function boldToggle<T extends { readonly bold: boolean }>(write: (item: T, bold: boolean) => void): Control<T> {
  return toggle<T>("Bold", BOLD_ICON, (item) => item.bold, write);
}

// Lucide "contrast"
const CONTRAST_ICON: IconDef = [
  ["circle", { cx: 12, cy: 12, r: 10 }],
  ["path", { d: "M12 18a6 6 0 0 0 0-12v12z" }],
];

/** White or black text for the whole item. */
export function whiteTextToggle<T extends { readonly textColor: TextColor }>(
  write: (item: T, textColor: TextColor) => void,
): Control<T> {
  return toggle<T>(
    "White text",
    CONTRAST_ICON,
    (item) => item.textColor === "white",
    (item, white) => write(item, white ? "white" : "black"),
  );
}

/** Button with icon and text that runs an action on the item. */
export function action<T>(label: string, icon: IconDef, run: (item: T) => void): Control<T> {
  return (current) => {
    const el = button("tool action");
    const text = document.createElement("span");
    text.textContent = label;
    el.append(renderIcon(icon), text);
    el.addEventListener("click", () => {
      const item = current();
      if (item) run(item);
    });
    return { el, sync: () => {} };
  };
}

/** A button that never takes focus on click. */
function button(className: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.addEventListener("mousedown", (event) => event.preventDefault());
  return el;
}

export interface NumberFieldSpec<T> {
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  read(item: T): number;
  write(item: T, value: number): void;
}

/**
 * Whole number input. Valid values apply live while typing, invalid ones
 * revert to the value in effect when the field is left.
 */
export function numberField<T>(spec: NumberFieldSpec<T>): Control<T> {
  return (current) => {
    const input = document.createElement("input");
    Object.assign(input, { type: "number", min: spec.min, max: spec.max, step: 1, inputMode: "numeric" });
    input.title = `${spec.label} (${spec.unit})`;
    input.setAttribute("aria-label", `${spec.label} in ${spec.unit}`);

    const reset = () => {
      const item = current();
      if (item) input.value = String(spec.read(item));
    };
    input.addEventListener("input", () => {
      const value = Number(input.value);
      const item = current();
      if (item && Number.isInteger(value) && value >= spec.min && value <= spec.max) spec.write(item, value);
    });
    input.addEventListener("change", reset);
    input.addEventListener("blur", reset);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        input.blur();
      }
    });

    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = spec.unit;
    unit.setAttribute("aria-hidden", "true");

    const label = document.createElement("label");
    label.className = "size-field";
    label.append(input, unit);

    return {
      el: label,
      // Never overwrite what the user is typing.
      sync: (item) => {
        if (document.activeElement !== input) input.value = String(spec.read(item));
      },
    };
  };
}

function divider(): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "divider";
  el.setAttribute("aria-hidden", "true");
  return el;
}
