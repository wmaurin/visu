import type { Observable } from "./core/observable";
import type { Diagram } from "./model/diagram";
import type { Selection } from "./model/types";
import type { Settings } from "./settings";
import type { Canvas } from "./ui/canvas";
import type { InlineEditor } from "./ui/inline-editor";

/** Shared services handed to tools, item handlers and commands. */
export interface AppContext {
  readonly canvas: Canvas;
  readonly diagram: Diagram;
  readonly selection: Observable<Selection>;
  readonly editor: InlineEditor;
  readonly settings: Observable<Settings>;
  /** Shown in the project bar, saved in the project file and used as its file name. */
  readonly projectName: Observable<string>;
}
