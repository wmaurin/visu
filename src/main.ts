import "./style.css";
import { Canvas } from "./canvas";
import { Diagram } from "./model";
import { renderDiagram } from "./renderer";
import { LabelEditor } from "./label-editor";
import { TextEditor } from "./text-editor";
import { Toolbar } from "./toolbar";
import { ArrowTool } from "./tools/arrow-tool";
import { RectTool } from "./tools/rect-tool";
import { SelectTool } from "./tools/select-tool";
import type { Tool, ToolContext } from "./tools/tool";

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  );
}

const diagram = new Diagram();
const canvas = new Canvas(requireElement("canvas"));
const textEditor = new TextEditor(canvas, diagram, render);
const labelEditor = new LabelEditor(canvas, diagram, render);
const ctx: ToolContext = { canvas, diagram, textEditor, labelEditor };

const tools: readonly Tool[] = [new SelectTool(ctx), new RectTool(ctx), new ArrowTool(ctx)];
const toolbar = new Toolbar(requireElement("toolbar"), tools, activate);

let active: Tool = tools[0]!;

function render(): void {
  renderDiagram(diagram, canvas.shapeLayer, {
    editingShapeId: textEditor.editingId,
    editingLabelId: labelEditor.editingId,
  });
}

/** Events inside an open editor belong to the editor, not to the tools. */
function inEditor(target: EventTarget | null): boolean {
  return textEditor.owns(target) || labelEditor.owns(target);
}

function activate(tool: Tool): void {
  if (tool !== active) {
    active.deactivate?.();
    active = tool;
  }
  canvas.setCursor(tool.cursor);
  toolbar.setActive(tool.id);
  tool.activate?.();
}

diagram.subscribe(render);

const svg = canvas.svg;

svg.addEventListener("pointerdown", (event) => {
  if (inEditor(event.target)) return;
  // Capture keeps the drag alive when the pointer leaves the canvas.
  svg.setPointerCapture(event.pointerId);
  active.pointerDown?.(canvas.pointer(event));
});

svg.addEventListener("pointermove", (event) => {
  if (inEditor(event.target)) return;
  active.pointerMove?.(canvas.pointer(event));
});

svg.addEventListener("pointerup", (event) => {
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  if (inEditor(event.target)) return;
  active.pointerUp?.(canvas.pointer(event));
});

svg.addEventListener("pointercancel", () => active.pointerCancel?.());

svg.addEventListener("dblclick", (event) => {
  if (inEditor(event.target)) return;
  active.doubleClick?.(canvas.pointer(event));
});

window.addEventListener("keydown", (event) => {
  if (isEditable(event.target)) return;
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
render();
