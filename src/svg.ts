const SVG_NS = "http://www.w3.org/2000/svg";

export type Attrs = Record<string, string | number>;

/**
 * Creates an SVG element via the DOM API. All content is set through
 * attributes and textContent, never innerHTML, so user supplied labels
 * can never be interpreted as markup.
 */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  el.append(...children);
  return el;
}

export function setAttrs(el: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, String(value));
  }
}

/** Icon definition: a list of primitive shapes drawn in a 20 × 20 box. */
export type IconDef = ReadonlyArray<readonly [keyof SVGElementTagNameMap, Attrs]>;

/** Renders an icon in the same stroke style as the diagram icon library. */
export function renderIcon(icon: IconDef): SVGSVGElement {
  return svgEl(
    "svg",
    {
      viewBox: "0 0 20 20",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    icon.map(([tag, attrs]) => svgEl(tag, attrs)),
  );
}
