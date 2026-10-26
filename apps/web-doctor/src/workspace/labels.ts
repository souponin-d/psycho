import type {
  EncounterField,
  PlanKind,
  VisitStatus,
  EventStatus,
} from "./model";
export const visitStatus: Record<VisitStatus, string> = {
  scheduled: "Запланирован",
  "in-progress": "Идёт приём",
  completed: "Завершён",
  cancelled: "Отменён",
};
export const eventStatus: Record<EventStatus, string> = {
  created: "Новое",
  acknowledged: "Принято",
  assessed: "Оценено",
  acted: "Действие выполнено",
  closed: "Закрыто",
};
export const planKind: Record<PlanKind, string> = {
  medication: "Препарат",
  psychotherapy: "Психотерапия",
  assessment: "Обследование",
  lifestyle: "Рекомендация",
  "follow-up": "Контрольный контакт",
};
export const encounterLabels: Record<EncounterField, string> = {
  mentalStatus: "Психический статус",
  somaticStatus: "Соматический статус",
  substances: "ПАВ, алкоголь и другие вещества",
  medicationReview: "Текущие препараты",
  adverseEffects: "Нежелательные явления",
  adherence: "Факты приёма, пропуски и причины",
  suicidalThoughts: "Мысли о смерти / суицидальные идеи",
  intentAndPlan: "Намерение и план, давность",
  pastAttempts: "Предыдущие попытки и поведение",
  meansAccess: "Доступ к средствам",
  protectiveFactors: "Поддержка и защитные факторы",
  safetyConclusion: "Заключение врача по рискам",
  safetyAction: "Действия и план по рискам",
  differential: "Дифференциальная оценка",
  conclusion: "Заключение врача",
  recommendations: "Рекомендации и следующий шаг",
  patientPreference: "Предпочтения и вопросы пациента",
};
export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Не указано";
  return new Intl.DateTimeFormat(
    "ru-RU",
    options ?? { day: "numeric", month: "short", year: "numeric" },
  ).format(new Date(value));
}
export function formatTime(value: string) {
  return formatDate(value, { hour: "2-digit", minute: "2-digit" });
}
export function age(birthDate: string, now = new Date()) {
  const date = new Date(birthDate);
  let years = now.getFullYear() - date.getFullYear();
  if (
    now.getMonth() < date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())
  )
    years--;
  return years;
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
}
export function localDateTime(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function today() {
  return localDateTime(new Date().toISOString()).slice(0, 10);
}
