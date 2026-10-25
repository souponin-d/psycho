export type Decoration = "leaf" | "lantern" | "stone";
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function decorations(days: string[]): Decoration[] {
  const count = new Set(days.filter(isDay)).size;
  return [
    "leaf",
    ...(count >= 1 ? ["lantern" as const] : []),
    ...(count >= 3 ? ["stone" as const] : []),
  ];
}
export function shoreProgress(days: string[], today: string) {
  if (!isDay(today)) return { weekDays: 0, totalDays: 0, goal: 3 };
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const monday = date.toISOString().slice(0, 10);
  const unique = [...new Set(days.filter(isDay))];
  return {
    weekDays: unique.filter((day) => day >= monday && day <= today).length,
    totalDays: unique.length,
    goal: 3,
  };
}
