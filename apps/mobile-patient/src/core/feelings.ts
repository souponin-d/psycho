export type FeelingPoint = { valence: number; energy: number };
export type Expression =
  | "tense"
  | "surprise"
  | "joy"
  | "sad"
  | "neutral"
  | "happy"
  | "tired"
  | "quiet"
  | "calm";
export const feelings = [
  {
    id: "tired",
    label: "Усталость",
    hue: "#C7A8E0",
    glow: "#72528A",
    kind: "tired",
  },
  {
    id: "quiet",
    label: "Тихо",
    hue: "#B5D0E8",
    glow: "#41647E",
    kind: "quiet",
  },
  {
    id: "calm",
    label: "Спокойствие",
    hue: "#CAE0B2",
    glow: "#4B7253",
    kind: "calm",
  },
  { id: "sad", label: "Грусть", hue: "#C2B5E8", glow: "#564779", kind: "sad" },
  {
    id: "neutral",
    label: "Ровно",
    hue: "#C7DED3",
    glow: "#3F6D65",
    kind: "neutral",
  },
  {
    id: "happy",
    label: "Хорошо",
    hue: "#D9E7AD",
    glow: "#75834A",
    kind: "happy",
  },
  {
    id: "tense",
    label: "Напряжение",
    hue: "#E7B9EF",
    glow: "#62386E",
    kind: "tense",
  },
  {
    id: "surprise",
    label: "Волнение",
    hue: "#F4C0AA",
    glow: "#914F60",
    kind: "surprise",
  },
  {
    id: "joy",
    label: "Воодушевление",
    hue: "#FFF0A7",
    glow: "#8A7119",
    kind: "joy",
  },
] as const;
export function validFeeling(value: unknown): value is FeelingPoint {
  if (!value || typeof value !== "object") return false;
  const p = value as FeelingPoint;
  return [p.valence, p.energy].every(
    (n) => Number.isInteger(n) && n >= 0 && n <= 6,
  );
}
export function pointFromPosition(
  x: number,
  y: number,
  size: number,
  padding: number,
): FeelingPoint {
  const span = Math.max(1, size - padding * 2);
  const cell = (n: number) =>
    Math.max(0, Math.min(6, Math.round(Number.isFinite(n) ? n : 3)));
  return {
    valence: cell(((x - padding) / span) * 6),
    energy: 6 - cell(((y - padding) / span) * 6),
  };
}
export function feelingAt(point: FeelingPoint) {
  const band = (n: number) => (n < 2 ? 0 : n > 4 ? 2 : 1);
  return feelings[band(point.energy) * 3 + band(point.valence)]!;
}
export function feelingHint(point: FeelingPoint) {
  return `${point.valence < 2 ? "Неприятно" : point.valence > 4 ? "Приятно" : "Смешанные ощущения"} · ${point.energy < 2 ? "мало энергии" : point.energy > 4 ? "много энергии" : "средняя энергия"}`;
}
export function legacyMood(
  point: FeelingPoint,
): "low" | "uneasy" | "neutral" | "calm" | "good" {
  return point.valence < 2
    ? point.energy > 4
      ? "uneasy"
      : "low"
    : point.valence > 4
      ? point.energy < 2
        ? "calm"
        : "good"
      : "neutral";
}
