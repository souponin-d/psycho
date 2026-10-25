import {
  scenes,
  wardrobe,
  worldItems,
  type SceneDefinition,
  type WorldItem,
} from "../config/worldCatalog.ts";
import type { JourneyState, Placement, WorldState } from "./journeyModel.ts";
import { PatientValidationError } from "./patientErrors.ts";

export function cloneWorld(world: WorldState): WorldState {
  return {
    ...world,
    territory: world.territory,
    placements: world.placements.map((p) => ({ ...p })),
    outfits: {
      fluffy: { ...world.outfits.fluffy },
      cloud: { ...world.outfits.cloud },
    },
  };
}

export function validatePlacement(
  item: WorldItem,
  p: Placement,
  scene: SceneDefinition,
): { valid: boolean; reason?: string } {
  if (
    ![p.x, p.y, p.rotation, p.scale].every(Number.isFinite) ||
    p.scale < 0.7 ||
    p.scale > 1.3 ||
    Math.abs(p.rotation) > 180
  )
    return {
      valid: false,
      reason: "Размер от 70 до 130%, поворот от −180 до 180°",
    };
  const radians = (p.rotation * Math.PI) / 180;
  const radius =
    (item.size *
      p.scale *
      (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)))) /
    640;
  if (
    p.x < radius + 0.02 ||
    p.x > 0.98 - radius ||
    p.y < radius / 3 + 0.02 ||
    p.y > 0.98 - radius / 3
  )
    return { valid: false, reason: "Оставьте предмет целиком внутри мира" };
  if (
    scene.stones.some(
      ([x, y]) => Math.hypot(p.x - x, (p.y - y) * 3) < radius + 0.095,
    )
  )
    return { valid: false, reason: "Оставьте календарную площадку свободной" };
  return { valid: true };
}
export function ownsItem(state: JourneyState, itemId: string) {
  return (
    !!worldItems.find((i) => i.id === itemId && i.free) ||
    state.rewards.some((r) => r.itemId === itemId)
  );
}
export function validateWorld(state: JourneyState, world: WorldState) {
  if (
    (world.ambience && !["morning", "dusk", "mist"].includes(world.ambience)) ||
    (world.flora && !["flowers", "ferns"].includes(world.flora))
  )
    throw new PatientValidationError("Выберите доступное окружение");
  const scene = scenes[world.territory];
  if (
    !scene ||
    (world.territory === "garden" &&
      !state.rewards.some((r) => r.itemId === "garden"))
  )
    throw new PatientValidationError("Эта территория пока закрыта");
  if (
    world.placements.length > 20 ||
    new Set(world.placements.map((p) => p.instanceId)).size !==
      world.placements.length
  )
    throw new PatientValidationError(
      "В мире может быть до 20 отдельных предметов",
    );
  for (const p of world.placements) {
    const item = worldItems.find((i) => i.id === p.itemId);
    if (!item || !p.instanceId || !ownsItem(state, p.itemId))
      throw new PatientValidationError("Предмет пока не открыт");
    if (world.placements.filter((i) => i.itemId === p.itemId).length > item.max)
      throw new PatientValidationError("Достигнут предел этого предмета");
    const result = validatePlacement(item, p, scene);
    if (!result.valid) throw new PatientValidationError(result.reason!);
  }
  for (const outfit of Object.values(world.outfits)) {
    if (
      !wardrobe.colors.some((c) => c.id === outfit.color) ||
      !wardrobe.clothing.some((c) => c.id === outfit.clothing) ||
      !wardrobe.accessories.some((a) => a.id === outfit.accessory)
    )
      throw new PatientValidationError(
        "Выберите доступный вариант внешнего вида",
      );
  }
}
// A connected corridor on the path is kept free for the companion; objects may
// decorate the sides, but cannot become mandatory obstacles for date navigation.
export function reachableWalkPoints(world: WorldState) {
  const points: { x: number; y: number }[] = [];
  for (let y = 0.32; y <= 0.85; y += 0.035)
    for (let x = 0.15; x <= 0.85; x += 0.07)
      if (
        world.placements.every(
          (p) => Math.hypot(x - p.x, (y - p.y) * 3) > 0.16 * p.scale,
        )
      )
        points.push({ x, y });
  return points;
}
export function findPlacement(
  state: JourneyState,
  itemId: string,
): Placement | null {
  const item = worldItems.find((i) => i.id === itemId);
  if (
    !item ||
    !ownsItem(state, itemId) ||
    state.world.placements.length >= 20 ||
    state.world.placements.filter((p) => p.itemId === itemId).length >= item.max
  )
    return null;
  for (let y = 0.9; y > 0.08; y -= 0.08)
    for (const x of [0.18, 0.82, 0.32, 0.68, 0.5]) {
      const candidate = {
        instanceId: "object-" + Date.now() + "-" + itemId,
        itemId,
        x,
        y,
        scale: 1,
        rotation: 0,
      };
      if (
        validatePlacement(item, candidate, scenes[state.world.territory])
          .valid &&
        state.world.placements.every(
          (p) => Math.hypot(x - p.x, (y - p.y) * 3) > 0.18,
        )
      )
        return candidate;
    }
  return null;
}
