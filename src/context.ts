import type { Observable } from "./core/observable";
import type { Diagram } from "./model/diagram";
import type { Ref } from "./model/types";
import type { Settings } from "./settings";
import type { Canvas } from "./ui/canvas";
import type { InlineEditor } from "./ui/inline-editor";

/** Shared services handed to tools, item handlers and commands. */
export interface AppContext {
  readonly canvas: Canvas;
  readonly diagram: Diagram;
  readonly selection: Observable<Ref | null>;
  readonly editor: InlineEditor;
  readonly settings: Observable<Settings>;
}
