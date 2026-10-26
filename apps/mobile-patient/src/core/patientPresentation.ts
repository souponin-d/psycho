import { isDay } from "./shore.ts";

/** Только представление: исходные версии и происхождение не переписываются. */
export function patientLabel(value: string, fallback = "Не указано"): string {
  const text = value.trim();
  if (!text) return fallback;
  if (text === "Дозировка задана в учебном плане")
    return "Дозировка не указана";
  if (text === "Учебная консультация · онлайн") return "Онлайн-консультация";
  return text.replace(/\s*·\s*учебный врач/iu, "");
}
export function dayRangeLabel(from: string, to: string): string {
  if (!isDay(from) || !isDay(to)) throw new Error("Некорректный диапазон дат");
  const date = (day: string, year = false) =>
    new Date(day + "T12:00:00Z")
      .toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        ...(year ? { year: "numeric" } : {}),
        timeZone: "UTC",
      })
      .replace(/\s*г\.$/, "");
  if (from === to) return date(from);
  if (from.slice(0, 7) === to.slice(0, 7))
    return Number(from.slice(-2)) + "–" + date(to);
  const differentYear = from.slice(0, 4) !== to.slice(0, 4);
  return date(from, differentYear) + " – " + date(to, differentYear);
}
export const sleepLabel = (value: string | null | undefined) =>
  value ?? "Нет записи";
