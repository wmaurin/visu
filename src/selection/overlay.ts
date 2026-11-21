import type { AppContext } from "../context";
import type { Patch } from "../model/diagram";
import type { Overlay } from "../model/types";
import { colorField, FloatingBar, numberField } from "../ui/floating-bar";
import { boxBehaviour } from "./box";
import type { Handler } from "./handler";

/** Overlays: move and resize like boxes, colour and transparency from the bar. */
export function overlayHandler(ctx: AppContext): Handler<Overlay> {
  const set = (o: Overlay, patch: Patch<"overlays">) => ctx.diagram.update("overlays", o.id, patch);

  return {
    ...boxBehaviour<Overlay>(ctx, "overlays"),
    cursor: "move",
    bar: new FloatingBar<Overlay>(ctx.canvas, "Overlay format", [
      colorField("Colour", (o) => o, (o, value) => set(o, value)),
      numberField({
        label: "Transparency",
        unit: "%",
        min: 0,
        max: 100,
        read: (o) => o.transparency,
        write: (o, transparency) => set(o, { transparency }),
      }),
    ]),
  };
}
