import type { Mood } from "../core/model";

export const mascotOptions = [
  {
    id: "fluffy" as const,
    name: "Пушистик",
    detail: "Тёплый и любопытный",
    image: require("../../assets/images/fluffy.png"),
  },
  {
    id: "cloud" as const,
    name: "Облачко",
    detail: "Мягкое и спокойное",
    image: require("../../assets/images/cloud.png"),
  },
];
export const moodOptions: {
  id: Mood;
  label: string;
  color: string;
  hint: string;
}[] = [
  {
    id: "low",
    label: "Тяжело",
    color: "#C5BDD8",
    hint: "Сегодня непростой день",
  },
  {
    id: "uneasy",
    label: "Тревожно",
    color: "#C4BCD7",
    hint: "Чувствую напряжение",
  },
  {
    id: "neutral",
    label: "Обычно",
    color: "#DBCFAE",
    hint: "Ничего особенного",
  },
  {
    id: "calm",
    label: "Спокойно",
    color: "#AFC7A3",
    hint: "Есть немного тишины",
  },
  {
    id: "good",
    label: "Хорошо",
    color: "#D1E5A6",
    hint: "Есть силы и настроение",
  },
];
export const tasks = [
  {
    id: "morning",
    time: "09:00",
    title: "Утренний приём",
    subtitle: "Препарат из плана · по назначению врача",
    icon: "pill" as const,
    period: "Утро",
  },
  {
    id: "checkin",
    time: "13:00",
    title: "Момент для себя",
    subtitle: "Короткая запись о самочувствии",
    icon: "heart" as const,
    period: "День",
  },
  {
    id: "walk",
    time: "17:00",
    title: "Небольшая прогулка",
    subtitle: "Немного воздуха, в своём ритме",
    icon: "leaf" as const,
    period: "День",
  },
  {
    id: "evening",
    time: "21:00",
    title: "Вечерняя пауза",
    subtitle: "Оглянуться на день и оставить заметку",
    icon: "moon" as const,
    period: "Вечер",
  },
];
export const onboardingCopy = [
  {
    title: "Привет,\nэто Синкли",
    body: "Маленькое пространство\nдля заботы о себе.",
  },
  {
    title: "Кто будет\nрядом?",
    body: "Выберите спутника. Его всегда\nможно поменять в настройках.",
  },
  {
    title: "Ваше\nпространство",
    body: "Три настроения. Один привычный\nи понятный мир.",
  },
  {
    title: "В вашем\nритме",
    body: "Познакомимся? Пока это тестовые\nнастройки для знакомства с приложением.",
  },
  {
    title: "Каждый день —\nпо-своему",
    body: "План, маленькие отметки и немного\nвнимания к себе. Начнём?",
  },
];
export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dayLabel(day = dayKey(), short = false): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(
    "ru-RU",
    short
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "long" },
  );
}
export function recentDays(count = 7): string[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - count + 1 + i);
    return dayKey(date);
  });
}
