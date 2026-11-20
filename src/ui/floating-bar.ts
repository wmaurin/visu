import type { Rect } from "../core/geometry";
import { renderIcon, type IconDef } from "../core/svg";
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
    menu.hidden = true;

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

    const wrapper = document.createElement("div");
    wrapper.className = "dropdown";
    wrapper.append(trigger, menu);

    const onOutside = (event: PointerEvent) => {
      if (!wrapper.contains(event.target as Node)) close();
    };
    function open(): void {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onOutside, true);
    }
    function close(): void {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onOutside, true);
    }

    trigger.addEventListener("click", () => (menu.hidden ? open() : close()));
    wrapper.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || menu.hidden) return;
      // Closes the menu only, without clearing the selection.
      event.stopPropagation();
      close();
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
