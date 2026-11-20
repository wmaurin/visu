import type { HAlign, VAlign } from "../model/types";
import type { Choice } from "../ui/floating-bar";

/** Alignment options for format bars. Icons in Lucide style (24 × 24 grid). */

export const H_ALIGN: ReadonlyArray<Choice<HAlign>> = [
  { value: "left", label: "Left", icon: [["path", { d: "M3 6h18M3 12h12M3 18h15" }]] },
  { value: "center", label: "Centre", icon: [["path", { d: "M3 6h18M6 12h12M4.5 18h15" }]] },
  { value: "right", label: "Right", icon: [["path", { d: "M3 6h18M9 12h12M6 18h15" }]] },
];

const BOX = ["rect", { x: 8, y: 7, width: 8, height: 10, rx: 1.5 }] as const;

export const V_ALIGN: ReadonlyArray<Choice<VAlign>> = [
  { value: "top", label: "Top", icon: [["path", { d: "M4 3h16" }], BOX] },
  { value: "middle", label: "Middle", icon: [["path", { d: "M3 12h5M16 12h5" }], BOX] },
  { value: "bottom", label: "Bottom", icon: [["path", { d: "M4 21h16" }], BOX] },
];
