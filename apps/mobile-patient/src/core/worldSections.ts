import type { JourneyState, WorldState, WorldSection } from "./journeyModel.ts";
import { daysBetween, shiftDay } from "./calendar.ts";
import { isDay } from "./shore.ts";
export const SECTION_DAYS = 3;
export function sectionBaseDay(start: string, day: string) {
  return shiftDay(
    start,
    Math.max(0, Math.floor(daysBetween(start, day) / SECTION_DAYS)) *
      SECTION_DAYS,
  );
}
export function upgradeWorldSections(
  state: JourneyState,
  today: string,
): JourneyState {
  if (state.world.anchorDay) {
    if (
      !isDay(state.world.anchorDay) ||
      state.world.anchorDay < state.plan.startedAt
    )
      throw Error(
        "Не удалось восстановить участок мира. Исходный профиль сохранён.",
      );
    return state;
  }
  return {
    ...state,
    world: {
      ...state.world,
      anchorDay: sectionBaseDay(state.plan.startedAt, today),
      sections: state.world.sections ?? [],
    },
  };
}
export function worldSection(world: WorldState): WorldSection {
  return {
    anchorDay: world.anchorDay!,
    territory: world.territory,
    ambience: world.ambience,
    flora: world.flora,
    placements: world.placements.map((p) => ({ ...p })),
  };
}
export function allWorldSections(state: JourneyState): WorldSection[] {
  const active = worldSection(state.world);
  return [
    ...(state.world.sections ?? []).filter(
      (s) => s.anchorDay !== active.anchorDay,
    ),
    active,
  ].sort((a, b) => a.anchorDay.localeCompare(b.anchorDay));
}
export function openWorldSection(
  state: JourneyState,
  day: string,
): JourneyState {
  const base = upgradeWorldSections(state, day),
    anchorDay = sectionBaseDay(base.plan.startedAt, day),
    world = base.world;
  if (world.anchorDay === anchorDay) return base;
  const target = world.sections?.find((s) => s.anchorDay === anchorDay) ?? {
    anchorDay,
    territory: world.territory,
    ambience: world.ambience,
    flora: world.flora,
    placements: [],
  };
  const sections = [
    ...(world.sections ?? []).filter(
      (s) => s.anchorDay !== anchorDay && s.anchorDay !== world.anchorDay,
    ),
    worldSection(world),
  ];
  return {
    ...base,
    world: {
      ...world,
      ...target,
      placements: target.placements.map((p) => ({ ...p })),
      sections,
    },
  };
}
