import { daysBetween, shiftDay } from "./calendar.ts";
import type { DayKey, JourneyState } from "./journeyModel.ts";

export function journeyMap(state: JourneyState, today: DayKey) {
  const todayIndex = Math.max(0, daysBetween(state.plan.startedAt, today));
  const days = Array.from({ length: todayIndex + 8 }, (_, index) => {
    const day = shiftDay(state.plan.startedAt, index);
    const status: "complete" | "missed" | "today" | "future" =
      day === today
        ? "today"
        : day > today
          ? "future"
          : state.closedDays[day]?.complete
            ? "complete"
            : "missed";
    return { day, index, status, chapter: Math.floor(index / 7) + 1 };
  });
  return { days, todayIndex };
}
