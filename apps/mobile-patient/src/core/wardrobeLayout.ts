import { companionGeometry } from "../config/companionGeometry.ts";
import type { MascotId } from "./model.ts";
import type { CompanionFrame } from "./companionTimeline.ts";
export type WardrobeItem =
  "scarf" | "hoodie" | "cape" | "star" | "bow" | "leaf";
export function wardrobeRect(
  mascot: MascotId,
  group: CompanionFrame["group"],
  index: number,
  item: WardrobeItem,
) {
  const [left, top, right, bottom] =
      companionGeometry[mascot + "-" + group + "-" + index],
    w = right - left,
    cx = (left + right) / 2;
  if (item === "scarf")
    return { x: cx - w * 0.38, y: bottom - 92, width: w * 0.76, height: 112 };
  if (item === "hoodie")
    return { x: cx - w * 0.47, y: bottom - 128, width: w * 0.94, height: 148 };
  if (item === "cape")
    return { x: cx - w * 0.49, y: bottom - 124, width: w * 0.98, height: 148 };
  const width = item === "bow" ? 84 : item === "leaf" ? 72 : 62,
    height = item === "bow" ? 60 : item === "leaf" ? 46 : 52;
  return { x: cx + w * 0.2 - width / 2, y: top + 16, width, height };
}
