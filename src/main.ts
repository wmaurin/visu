import "./style.css";
import { createCommands, type Command } from "./commands";
import type { AppContext } from "./context";
import { Observable } from "./core/observable";
import { Diagram } from "./model/diagram";
import { sameRef, type Ref } from "./model/types";
import { renderDiagram, renderFrames } from "./render/renderer";
import { ArrowTool } from "./tools/arrow-tool";
import { frameTool, rectTool } from "./tools/box-tool";
import { SelectTool } from "./tools/select-tool";
import { TextTool } from "./tools/text-tool";
import type { Tool } from "./tools/tool";
import { Canvas } from "./ui/canvas";
import { InlineEditor } from "./ui/inline-editor";
import { bind, createSettings } from "./settings";
import { rangeSetting, SettingsMenu, settingsFileActions, type SettingsCategory } from "./ui/settings";
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
  settings: createSettings(),
};

const applySettings = () => canvas.setGridSaturation(ctx.settings.get().gridSaturation);
ctx.settings.subscribe(applySettings);
applySettings();

const tools: readonly Tool[] = [
  new SelectTool(ctx),
  rectTool(ctx),
  new ArrowTool(ctx),
  new TextTool(ctx),
  frameTool(ctx),
];
const toolbar = new Toolbar(requireElement("toolbar"), tools, activate);

const settingsCategories: SettingsCategory[] = [
  {
    id: "general",
    label: "General",
    // Lucide "sliders-horizontal"
    icon: [["path", { d: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" }]],
  },
  {
    id: "appearance",
    label: "Appearance",
    // Lucide "sun"
    icon: [
      ["circle", { cx: 12, cy: 12, r: 4 }],
      ["path", { d: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" }],
    ],
    controls: [
      rangeSetting({ label: "Grid saturation", min: 0, max: 100, unit: "%" }, bind(ctx.settings, "gridSaturation")),
    ],
  },
];
new SettingsMenu(requireElement("app"), settingsCategories, settingsFileActions(ctx.settings));

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
  renderFrames(diagram.doc, canvas.frameLayer, ctx.editor.editing);
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
