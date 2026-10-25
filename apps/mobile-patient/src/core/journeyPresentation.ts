import { shiftDay } from "./calendar.ts";
export type JourneyDayStatus = "today" | "complete" | "missed" | "future";
const dateLabel = (day: string) =>
  new Date(day + "T12:00:00")
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(/\.$/, "");
export function dayMarkerPresentation(
  day: string,
  status: JourneyDayStatus,
  todayComplete: boolean,
) {
  const completed =
    status === "complete" || (status === "today" && todayComplete);
  return {
    date: dateLabel(day),
    status:
      status === "today"
        ? completed
          ? "Всё выполнено"
          : "Сегодня"
        : status === "complete"
          ? "Выполнено"
          : status === "missed"
            ? "Пропуск"
            : "Впереди",
    symbol: completed ? "✓" : status === "missed" ? "—" : "",
    active: status === "today",
    completed,
  };
}
export function journeyHud(
  completed: number,
  total: number,
  successes: number,
  chapterStart: string,
) {
  const remaining = Math.max(0, total - completed);
  const noun =
    remaining % 10 === 1 && remaining % 100 !== 11
      ? "дело"
      : remaining % 10 >= 2 &&
          remaining % 10 <= 4 &&
          (remaining % 100 < 12 || remaining % 100 > 14)
        ? "дела"
        : "дел";
  return {
    remaining,
    taskLabel: remaining
      ? `Осталось ${remaining} ${noun}`
      : "На сегодня всё выполнено",
    weekLabel: `${dateLabel(chapterStart)}–${dateLabel(shiftDay(chapterStart, 6))} · ${successes} из 5 дней`,
  };
}
