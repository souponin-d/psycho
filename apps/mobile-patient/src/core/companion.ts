import { calendarStones } from "./pathLayout.ts";
import type { WorldState } from "./journeyModel.ts";
import { scenes, worldItems } from "../config/worldCatalog.ts";

export const companionModes = [
  "idle",
  "blink",
  "walk",
  "curious",
  "touch",
  "support",
  "sleepy",
  "surprised",
  "dayComplete",
  "reward",
  "dress",
  "sad",
] as const;
export type CompanionMode = (typeof companionModes)[number];
export type CompanionEvent =
  | "tick"
  | "tap"
  | "walk"
  | "object"
  | "report"
  | "complete"
  | "reward"
  | "dress"
  | "missed"
  | "sleep"
  | "surprise"
  | "pause";
export type CompanionReaction = { mode: CompanionMode; until: number };
export const modeDuration: Record<CompanionMode, number> = {
  idle: 4200,
  blink: 420,
  walk: 1800,
  curious: 1700,
  touch: 900,
  support: 1900,
  sleepy: 2400,
  surprised: 900,
  dayComplete: 1800,
  reward: 2100,
  dress: 1100,
  sad: 1400,
};
export function nextCompanionState(
  current: CompanionReaction,
  event: CompanionEvent,
  now: number,
): CompanionReaction {
  if (event === "pause") return { mode: "idle", until: 0 };
  if (event === "tick")
    return now >= current.until
      ? { mode: "idle", until: now + modeDuration.idle }
      : current;
  const mapping: Record<
    Exclude<CompanionEvent, "tick" | "pause">,
    CompanionMode
  > = {
    tap: "touch",
    walk: "walk",
    object: "curious",
    report: "support",
    complete: "dayComplete",
    reward: "reward",
    dress: "dress",
    missed: "sad",
    sleep: "sleepy",
    surprise: "surprised",
  };
  const mode = mapping[event];
  return { mode, until: now + modeDuration[mode] };
}
export function motionPose(mode: CompanionMode, phase: number) {
  const p = Math.max(0, Math.min(1, phase)),
    wave = Math.sin(p * Math.PI * 2),
    bump = Math.sin(p * Math.PI);
  const pose = { x: 0, y: 0, rotation: 0, scale: 1 };
  switch (mode) {
    case "idle":
      pose.y = -0.008 * wave;
      pose.scale = 1 + 0.006 * wave;
      break;
    case "walk":
      pose.y = -0.018 * Math.abs(Math.sin(p * Math.PI * 4));
      pose.rotation = wave * 3;
      break;
    case "touch":
      pose.y = -0.035 * bump;
      pose.scale = 1 + 0.035 * bump;
      pose.rotation = wave * 5;
      break;
    case "curious":
      pose.rotation = 5 * bump;
      break;
    case "support":
      pose.y = -0.012 * bump;
      pose.rotation = wave * 2;
      break;
    case "sleepy":
      pose.scale = 1 + 0.008 * wave;
      pose.rotation = 2 * bump;
      break;
    case "surprised":
      pose.scale = 1 + 0.04 * bump;
      pose.y = -0.025 * bump;
      break;
    case "dayComplete":
      pose.y = -0.05 * Math.abs(Math.sin(p * Math.PI * 2));
      pose.rotation = wave * 4;
      break;
    case "reward":
      pose.y = -0.055 * Math.abs(Math.sin(p * Math.PI * 2));
      pose.scale = 1 + 0.03 * bump;
      break;
    case "dress":
      pose.rotation = wave * 7;
      pose.scale = 1 + 0.02 * bump;
      break;
    case "sad":
      pose.y = 0.008 * bump;
      pose.rotation = -2 * bump;
      break;
  }
  return pose;
}
export type WalkPoint = { x: number; y: number };
const distance = (a: WalkPoint, b: WalkPoint) =>
  Math.hypot(a.x - b.x, (a.y - b.y) * 3);
function free(p: WalkPoint, world: WorldState) {
  return (
    calendarStones(scenes[world.territory]).every(
      // Центр тела выше опорной точки; запас учитывает 144 dp и экран 320 dp.
      ([x, y]) => distance({ x: p.x, y: p.y - 0.03 }, { x, y }) > 0.31,
    ) &&
    world.placements.every(
      (o) =>
        distance(p, o) >
        ((worldItems.find((i) => i.id === o.itemId)?.size ?? 64) / 720) *
          o.scale +
          0.08,
    )
  );
}
/** A grid route checks intermediate segments too; it never teleports through furniture. */
export function routeToObject(
  start: WalkPoint,
  world: WorldState,
  targetId?: string,
  destination?: WalkPoint,
): WalkPoint[] {
  const grid: WalkPoint[] = [];
  for (let row = 0; row < 22; row++)
    for (let col = 0; col < 11; col++) {
      const p = { x: 0.15 + col * 0.07, y: 0.13 + row * 0.035 };
      if (free(p, world)) grid.push(p);
    }
  if (!grid.length) return [];
  const nearest = (p: WalkPoint) =>
    grid.reduce((best, q) => (distance(q, p) < distance(best, p) ? q : best));
  const target = world.placements.find((p) => p.instanceId === targetId);
  const source = nearest(start);
  let end = target
    ? nearest(target)
    : destination
      ? nearest(destination)
      : grid[Math.floor(Math.random() * grid.length)];
  const queue = [source],
    seen = new Map<WalkPoint, WalkPoint | null>([[source, null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p === end) break;
    for (const q of grid) {
      if (seen.has(q) || distance(p, q) > 0.13) continue;
      if (
        ![0.25, 0.5, 0.75].every((t) =>
          free({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, world),
        )
      )
        continue;
      seen.set(q, p);
      queue.push(q);
    }
  }
  if (!seen.has(end)) {
    const wanted = target ?? destination ?? end;
    end = [...seen.keys()].reduce((best, q) =>
      distance(q, wanted) < distance(best, wanted) ? q : best,
    );
  }
  const path: WalkPoint[] = [];
  for (let p: WalkPoint | null = end; p; p = seen.get(p) ?? null)
    path.unshift(p);
  // A new placement may occupy the old position: re-anchor to the nearest free
  // point while editing/returning; autonomous motion itself follows this route.
  return path;
}
