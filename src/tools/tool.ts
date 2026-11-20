import type { Canvas, CanvasPointer } from "../canvas";
import type { Diagram } from "../model";
import type { IconDef } from "../svg";
import type { LabelEditor } from "../label-editor";
import type { TextEditor } from "../text-editor";

export interface ToolContext {
  readonly canvas: Canvas;
  readonly diagram: Diagram;
  readonly textEditor: TextEditor;
  readonly labelEditor: LabelEditor;
}

export interface Tool {
  readonly id: string;
  readonly label: string;
  /** Single lower case key that activates the tool. */
  readonly shortcut: string;
  readonly icon: IconDef;
  readonly cursor: string;

  activate?(): void;
  /** Must discard any unfinished interaction. */
  deactivate?(): void;

  pointerDown?(p: CanvasPointer): void;
  pointerMove?(p: CanvasPointer): void;
  pointerUp?(p: CanvasPointer): void;
  /** Interaction interrupted by the system, e.g. lost pointer capture. */
  pointerCancel?(): void;
  doubleClick?(p: CanvasPointer): void;

  /** Returns true when the key was handled. */
  keyDown?(event: KeyboardEvent): boolean;
}
