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

/**
 * Sets attributes. `style` goes through the CSSOM instead: the Content
 * Security Policy blocks style attributes set as markup, not via the CSSOM.
 * Serialising still writes it as an attribute, so exports keep it.
 */
export function setAttrs(el: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "style" && (el instanceof SVGElement || el instanceof HTMLElement)) el.style.cssText = String(value);
    else el.setAttribute(name, String(value));
  }
}

/**
 * Editor UI icon: a list of primitive shapes drawn in a 24 × 24 box,
 * following the Lucide icon conventions (https://lucide.dev, ISC licence).
 * Diagram node icons are a separate set on a 20 × 20 grid.
 */
export type IconDef = ReadonlyArray<readonly [keyof SVGElementTagNameMap, Attrs]>;

export function renderIcon(icon: IconDef): SVGSVGElement {
  return svgEl(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.75,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    icon.map(([tag, attrs]) => svgEl(tag, attrs)),
  );
}
