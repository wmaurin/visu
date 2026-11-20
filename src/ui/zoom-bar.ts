import { renderIcon, type IconDef } from "../core/svg";
import type { Canvas } from "./canvas";

/** Zoom factor per button press, the same in both directions. */
export const ZOOM_STEP = 1.25;

// Lucide "minus" and "plus"
const MINUS: IconDef = [["path", { d: "M5 12h14" }]];
const PLUS: IconDef = [["path", { d: "M5 12h14M12 5v14" }]];

/** Zoom out, current zoom (click resets to 100 %), zoom in. Bottom left, next to settings. */
export function zoomBar(host: HTMLElement, canvas: Canvas): void {
  const bar = document.createElement("div");
  bar.className = "zoom-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Zoom");

  const iconButton = (label: string, icon: IconDef, run: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tool";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.append(renderIcon(icon));
    button.addEventListener("click", run);
    return button;
  };

  const level = document.createElement("button");
  level.type = "button";
  level.className = "zoom-level";
  level.title = "Reset to 100 % (Ctrl+0)";
  level.addEventListener("click", () => canvas.zoomTo(1));

  bar.append(
    iconButton("Zoom out (Ctrl+-)", MINUS, () => canvas.zoomAt(canvas.centre(), 1 / ZOOM_STEP)),
    level,
    iconButton("Zoom in (Ctrl++)", PLUS, () => canvas.zoomAt(canvas.centre(), ZOOM_STEP)),
  );
  host.append(bar);

  const sync = () => {
    level.textContent = `${Math.round(canvas.zoom * 100)} %`;
  };
  canvas.subscribe(sync);
  sync();
}
