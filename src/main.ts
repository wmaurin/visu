import "./style.css";
import { createCommands, type Command } from "./commands";
import type { AppContext } from "./context";
import { Observable } from "./core/observable";
import { Diagram } from "./model/diagram";
import { sameRef, type Ref } from "./model/types";
import { renderDiagram } from "./render/renderer";
import { ArrowTool } from "./tools/arrow-tool";
import { RectTool } from "./tools/rect-tool";
import { SelectTool } from "./tools/select-tool";
import type { Tool } from "./tools/tool";
import { Canvas } from "./ui/canvas";
import { InlineEditor } from "./ui/inline-editor";
import { Toolbar } from "./ui/toolbar";

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

/** "mod+c", "shift+a", "escape" … `mod` is Ctrl, or Cmd on macOS. */
function keyId(event: KeyboardEvent): string {
  const mods = [event.ctrlKey || event.metaKey ? "mod" : "", event.altKey ? "alt" : "", event.shiftKey ? "shift" : ""];
  return [...mods.filter(Boolean), event.key.toLowerCase()].join("+");
}

// Composition root

const canvas = new Canvas(requireElement("canvas"));
const diagram = new Diagram();
const ctx: AppContext = {
  canvas,
  diagram,
  selection: new Observable<Ref | null>(null, sameRef),
  editor: new InlineEditor(canvas, diagram, render),
};

const tools: readonly Tool[] = [new SelectTool(ctx), new RectTool(ctx), new ArrowTool(ctx)];
const toolbar = new Toolbar(requireElement("toolbar"), tools, activate);
let active: Tool = tools[0]!;

const commands = createCommands(ctx);
const keymap: Record<string, Command> = {
  escape: () => !!active.cancel?.() || commands.clearSelection(),
  delete: commands.deleteSelection,
  backspace: commands.deleteSelection,
  "mod+c": commands.copy,
  "mod+v": commands.paste,
  ...Object.fromEntries(tools.map((tool) => [tool.shortcut, () => (activate(tool), true)])),
};

function render(): void {
  renderDiagram(diagram.doc, canvas.documentLayer, ctx.editor.editing);
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

// Event wiring. Events inside the inline editor belong to the editor.

const svg = canvas.svg;

svg.addEventListener("pointerdown", (event) => {
  if (ctx.editor.owns(event.target)) return;
  // Capture keeps the drag alive when the pointer leaves the canvas.
  svg.setPointerCapture(event.pointerId);
  active.pointerDown?.(canvas.pointer(event));
});

svg.addEventListener("pointermove", (event) => {
  if (!ctx.editor.owns(event.target)) active.pointerMove?.(canvas.pointer(event));
});

svg.addEventListener("pointerup", (event) => {
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  if (!ctx.editor.owns(event.target)) active.pointerUp?.(canvas.pointer(event));
});

svg.addEventListener("pointercancel", () => active.cancel?.());

svg.addEventListener("dblclick", (event) => {
  if (!ctx.editor.owns(event.target)) active.doubleClick?.(canvas.pointer(event));
});

window.addEventListener("keydown", (event) => {
  if (isEditable(event.target)) return;
  if (keymap[keyId(event)]?.()) event.preventDefault();
});

diagram.subscribe(render);
activate(active);
render();
