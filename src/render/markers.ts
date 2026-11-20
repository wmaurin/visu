import { svgEl } from "../core/svg";
import { colours } from "./theme";

export const ARROW_MARKER_ID = "arrow";

/**
 * Arrow head from the style guide. `auto-start-reverse` lets the same
 * marker serve both ends, pointing outwards at each.
 */
export function arrowMarker(): SVGMarkerElement {
  return svgEl(
    "marker",
    {
      id: ARROW_MARKER_ID,
      viewBox: "0 0 10 10",
      refX: 9,
      refY: 5,
      markerWidth: 10,
      markerHeight: 10,
      markerUnits: "userSpaceOnUse",
      orient: "auto-start-reverse",
    },
    [svgEl("path", { d: "M1 1.5 L9 5 L1 8.5 Z", fill: colours.diagram })],
  );
}

export function markerAttrs(startCap: string, endCap: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (startCap === "arrow") attrs["marker-start"] = `url(#${ARROW_MARKER_ID})`;
  if (endCap === "arrow") attrs["marker-end"] = `url(#${ARROW_MARKER_ID})`;
  return attrs;
}
