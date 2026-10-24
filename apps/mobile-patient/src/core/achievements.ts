import type { JourneyState } from "./journeyModel.ts";

export function grantRewards(state: JourneyState): JourneyState {
  const chapters = new Map<number, string[]>();
  const start = Date.parse(state.plan.startedAt + "T12:00:00Z");
  for (const day of Object.values(state.closedDays)
    .filter((d) => d.complete)
    .sort((a, b) => a.day.localeCompare(b.day))) {
    const index = Math.floor(
      (Date.parse(day.day + "T12:00:00Z") - start) / 604800000,
    );
    if (index < 0) continue;
    chapters.set(index, [...(chapters.get(index) ?? []), day.day]);
  }
  const rewards = [...state.rewards];
  for (const [index, days] of chapters) {
    const id = "chapter-" + index;
    if (days.length >= 5 && !rewards.some((r) => r.id === id))
      rewards.push({
        id,
        itemId: index === 0 ? "garden" : "chapter-gift-" + index,
        day: days[4],
      });
  }
  return rewards.length === state.rewards.length
    ? state
    : { ...state, rewards };
}
