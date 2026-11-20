import type { Diagram, Shape } from "./model";
import { svgEl } from "./svg";
import { nodeStyle } from "./theme";

function renderShape(shape: Shape): SVGElement {
  switch (shape.kind) {
    case "rect":
      return svgEl("rect", {
        "data-id": shape.id,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        ...nodeStyle,
      });
  }
}

/** Full redraw of the shape layer. Cheap enough until diagrams get large. */
export function renderDiagram(diagram: Diagram, layer: SVGGElement): void {
  layer.replaceChildren(...diagram.all().map(renderShape));
}
