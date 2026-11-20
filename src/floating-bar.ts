import type { Canvas } from "./canvas";
import type { Rect } from "./geometry";
import { renderIcon, type IconDef } from "./svg";

/** Distance between a bar and its target. Clears the selection handles. */
const GAP = 12;
/** Minimum distance between a bar and the canvas edge. */
const EDGE = 8;

/** The floating bar container. Hidden until positioned. */
export function createBar(canvas: Canvas, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "floating-bar";
  el.setAttribute("role", "toolbar");
  el.setAttribute("aria-label", label);
  el.hidden = true;
  canvas.host.append(el);
  return el;
}

/**
 * Toggle button for a floating bar. It never takes focus, so an open text
 * editor stays open while the button is used.
 */
export function barButton(label: string, icon: IconDef, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  button.append(renderIcon(icon));
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", onClick);
  return button;
}

export function barDivider(): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "divider";
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** Shows the bar centred above `box`, or below it when there is no room above. */
export function placeBar(canvas: Canvas, el: HTMLElement, box: Rect): void {
  el.hidden = false;
  const top = canvas.toHost({ x: box.x + box.width / 2, y: box.y });
  const bottom = canvas.toHost({ x: box.x, y: box.y + box.height });
  const { offsetWidth: w, offsetHeight: h } = el;
  const maxLeft = canvas.host.clientWidth - w - EDGE;

  let y = top.y - GAP - h;
  if (y < EDGE) y = bottom.y + GAP;
  const x = Math.min(Math.max(top.x - w / 2, EDGE), maxLeft);

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
