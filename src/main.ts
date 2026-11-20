import "./style.css";
import { Canvas } from "./canvas";
import { Diagram } from "./model";
import { renderDiagram } from "./renderer";
import { Toolbar } from "./toolbar";
import { RectTool } from "./tools/rect-tool";
import type { Tool, ToolContext } from "./tools/tool";

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

const diagram = new Diagram();
const canvas = new Canvas(requireElement("canvas"));
const ctx: ToolContext = { canvas, diagram };

const tools: readonly Tool[] = [new RectTool(ctx)];
const toolbar = new Toolbar(requireElement("toolbar"), tools, activate);

let active: Tool = tools[0]!;

function activate(tool: Tool): void {
  if (tool !== active) {
    active.deactivate?.();
    active = tool;
  }
  canvas.setCursor(tool.cursor);
  toolbar.setActive(tool.id);
  tool.activate?.();
}

diagram.subscribe(() => renderDiagram(diagram, canvas.shapeLayer));

const svg = canvas.svg;

svg.addEventListener("pointerdown", (event) => {
  // Capture keeps the drag alive when the pointer leaves the canvas.
  svg.setPointerCapture(event.pointerId);
  active.pointerDown?.(canvas.pointer(event));
});

svg.addEventListener("pointermove", (event) => {
  active.pointerMove?.(canvas.pointer(event));
});

svg.addEventListener("pointerup", (event) => {
  active.pointerUp?.(canvas.pointer(event));
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
});

svg.addEventListener("pointercancel", () => active.pointerCancel?.());

window.addEventListener("keydown", (event) => {
  if (active.keyDown?.(event)) {
    event.preventDefault();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const tool = tools.find((t) => t.shortcut === event.key.toLowerCase());
  if (tool) {
    event.preventDefault();
    activate(tool);
  }
});

activate(active);
renderDiagram(diagram, canvas.shapeLayer);
