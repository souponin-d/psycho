import { companionGeometry } from "../config/companionGeometry.ts";
import type { CompanionFrame } from "./companionTimeline.ts";
import type { MascotId } from "./model.ts";
export type Garment = "scarf" | "hoodie" | "cape";
// Garments are authored for the neutral 512px body. Every pose uses the same
// anatomical registration; layers preserve the canonical face and feet.
export function garmentRig(
  mascot: MascotId,
  group: CompanionFrame["group"],
  index: number,
  garment: Garment,
) {
  const ref = companionGeometry[`${mascot}-idle-0`],
    target = companionGeometry[`${mascot}-${group}-${index}`];
  const sx = (target[2] - target[0]) / (ref[2] - ref[0]),
    sy = (target[3] - target[1]) / (ref[3] - ref[1]);
  const tx = target[0] - ref[0] * sx,
    ty = target[1] - ref[1] * sy;
  const cloud = mascot === "cloud";
  const [left, top, right, bottom] =
    garment === "hoodie"
      ? cloud
        ? [75, 224, 436, 402]
        : [100, 232, 414, 403]
      : garment === "cape"
        ? cloud
          ? [60, 228, 448, 411]
          : [74, 222, 436, 410]
        : cloud
          ? [80, 268, 433, 399]
          : [106, 270, 405, 396];
  const center = (left + right) / 2;
  const dip = garment === "scarf" ? 102 : garment === "cape" ? 184 : 180;
  return {
    sx,
    sy,
    tx,
    ty,
    transform: `translate(${tx} ${ty}) scale(${sx} ${sy})`,
    rect: { x: left, y: top, width: right - left, height: bottom - top },
    // Depth split is above the visible neckline: only raised rear hood/cape
    // tips stay behind the body. The curved collar itself must remain intact.
    frontPath: `M 0 ${top + 35} Q ${center} ${top - 5} 512 ${top + 35} L 512 512 L 0 512 Z`,
    neckCenterY: ty + (top + dip / 2) * sy,
    mouthY: ty + 287 * sy,
    feet: [
      { x: cloud ? 210 : 208, y: 408, rx: cloud ? 31 : 29, ry: 16 },
      { x: cloud ? 301 : 309, y: 408, rx: cloud ? 31 : 29, ry: 16 },
    ],
  };
}
export function warpGarmentPoint(
  rig: ReturnType<typeof garmentRig>,
  x: number,
  y: number,
) {
  return { x: rig.tx + x * rig.sx, y: rig.ty + y * rig.sy };
}
