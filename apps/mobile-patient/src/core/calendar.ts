import { isDay } from "./shore.ts";
import { assessDay } from "./therapy.ts";
import { grantRewards } from "./achievements.ts";
import type { DayKey, Instant, JourneyState } from "./journeyModel.ts";

export function dayAt(now: Instant): DayKey {
  return new Date(now.utcMs + now.offsetMinutes * 60000)
    .toISOString()
    .slice(0, 10);
}
export function instantNow(): Instant {
  const date = new Date();
  return {
    utcMs: date.getTime(),
    offsetMinutes: -date.getTimezoneOffset(),
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
export function shiftDay(day: DayKey, delta: number): DayKey {
  if (!isDay(day) || !Number.isInteger(delta))
    throw new Error("Некорректная дата");
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round(
    (Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) /
      86400000,
  );
}
export function closeElapsedDays(
  state: JourneyState,
  now: Instant,
): JourneyState {
  const today = dayAt(now);
  const closedDays = { ...state.closedDays };
  let changed = false;
  for (let day = state.plan.startedAt; day < today; day = shiftDay(day, 1)) {
    if (closedDays[day]) continue;
    closedDays[day] = {
      ...assessDay(state.plan, state.events, day),
      sealedAt: now.utcMs,
    };
    changed = true;
  }
  const lastObservedDay =
    today > state.lastObservedDay ? today : state.lastObservedDay;
  if (!changed && lastObservedDay === state.lastObservedDay) return state;
  return grantRewards({ ...state, closedDays, lastObservedDay });
}
export function journeyProgress(state: JourneyState, today: DayKey) {
  let streak = 0;
  for (
    let day = shiftDay(today, -1);
    day >= state.plan.startedAt;
    day = shiftDay(day, -1)
  ) {
    if (!state.closedDays[day]?.complete) break;
    streak++;
  }
  const chapterIndex = Math.max(
    0,
    Math.floor(daysBetween(state.plan.startedAt, today) / 7),
  );
  const chapterStart = shiftDay(state.plan.startedAt, chapterIndex * 7);
  const successes = Object.values(state.closedDays).filter(
    (d) =>
      d.complete && d.day >= chapterStart && d.day < shiftDay(chapterStart, 7),
  ).length;
  return {
    streak,
    chapterIndex,
    chapterStart,
    successes,
    goal: 5,
    today: assessDay(state.plan, state.events, today),
    dateLocked: !!state.closedDays[today],
  };
}
