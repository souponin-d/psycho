import type { SceneDefinition } from "../config/worldCatalog.ts";
/** Три крупных островка на исходном пейзаже: место для состояния и миниатюрного сада. */
export const CALENDAR_SLOTS = 3;
export function calendarStones(scene: SceneDefinition) {
  return [scene.stones[0]!, scene.stones[3]!, scene.stones[7]!] as const;
}
