import { questionnaires } from "../config/questionnaires.ts";
import { fieldComplete } from "./therapy.ts";
import { PatientValidationError } from "./patientErrors.ts";
import type {
  DayKey,
  DoseEvent,
  JourneyState,
  QuestionnaireAssignment,
  ReportEvent,
  PatientEvent,
  ReportFields,
} from "./journeyModel.ts";

export function completeQuestionnaire(
  assignment: QuestionnaireAssignment,
  answers: (number | null)[],
  impact?: number,
) {
  const form = questionnaires[assignment.formId];
  if (
    !form ||
    answers.length !== form.questions.length ||
    answers.some(
      (v) => typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 3,
    )
  )
    throw new PatientValidationError("Ответьте на все вопросы опроса");
  const needsImpact = !!form.impactQuestion && answers.some((v) => v! > 0);
  if (
    needsImpact &&
    (typeof impact !== "number" ||
      !Number.isInteger(impact) ||
      impact < 0 ||
      impact > 3)
  )
    throw new PatientValidationError("Ответьте на дополнительный вопрос");
  return {
    assignmentId: assignment.id,
    formId: assignment.formId,
    formVersion: form.version,
    answers: answers as number[],
    ...(needsImpact ? { impact } : {}),
  };
}
export function latestDose(
  state: JourneyState,
  day: DayKey,
  slotId: string,
): DoseEvent | undefined {
  return state.events
    .filter(
      (e): e is DoseEvent =>
        e.kind === "dose" && e.day === day && e.slotId === slotId,
    )
    .sort((a, b) => a.at - b.at)
    .at(-1);
}
export function latestReports(
  state: JourneyState,
  day?: DayKey,
): ReportEvent[] {
  const records = new Map<string, ReportEvent>();
  for (const e of state.events
    .filter(
      (e): e is ReportEvent => e.kind === "report" && (!day || e.day === day),
    )
    .sort((a, b) => a.at - b.at))
    records.set(e.entityId ?? e.id, e);
  return [...records.values()]
    .filter((e) => !e.deleted)
    .sort((a, b) => b.at - a.at);
}
export type AssignedTask = {
  id: string;
  kind: "dose" | "report" | "questionnaire";
  day: string;
  title: string;
  completed: boolean;
  time?: string;
  slotId?: string;
};
export function assignedTasks(
  state: JourneyState,
  day: DayKey,
): AssignedTask[] {
  const tasks: AssignedTask[] = state.plan.medication.slots.map((slot) => ({
    id: "dose:" + day + ":" + slot.id,
    kind: "dose",
    day,
    title: state.plan.medication.name,
    completed: latestDose(state, day, slot.id)?.status === "taken",
    time: slot.time,
    slotId: slot.id,
  }));
  const report = latestReports(state, day).find((r) => r.required);
  tasks.push({
    id: "report:" + day,
    kind: "report",
    day,
    title: "Самоотчёт",
    completed:
      !!report &&
      state.plan.reportFields.every((f) => fieldComplete(report.fields, f)),
  });
  for (const assignment of state.plan.tests.filter((t) => t.day === day))
    tasks.push({
      id: assignment.id,
      kind: "questionnaire",
      day,
      title: questionnaires[assignment.formId].title,
      completed: state.events.some(
        (e) =>
          e.kind === "questionnaire" &&
          e.assignmentId === assignment.id &&
          e.answers.length === assignment.questionCount,
      ),
    });
  return tasks;
}
export type PatientHistoryItem = {
  id: string;
  day: string;
  kind: PatientEvent["kind"];
  status: string;
  note?: string;
  fields?: ReportFields;
  label?: string;
};
export function publicHistory(state: JourneyState): PatientHistoryItem[] {
  const items: PatientHistoryItem[] = latestReports(state).map((e) => ({
    id: e.entityId ?? e.id,
    day: e.day,
    kind: "report",
    status: "Сохранён",
    fields: e.fields,
    note: e.note,
    label: e.label,
  }));
  const seen = new Map<string, PatientEvent>();
  for (const e of state.events
    .filter((e) => e.kind !== "report")
    .sort((a, b) => a.at - b.at))
    seen.set(
      e.kind === "dose"
        ? e.day + ":" + e.slotId
        : e.kind === "questionnaire"
          ? e.assignmentId
          : e.id,
      e,
    );
  for (const e of seen.values()) {
    if (e.kind === "dose")
      items.push({
        id: e.id,
        day: e.day,
        kind: "dose",
        status:
          e.status === "taken"
            ? "Принят"
            : e.status === "missed"
              ? "Пропущен"
              : "Нет отметки",
        note: e.note,
      });
    if (e.kind === "questionnaire")
      items.push({
        id: e.id,
        day: e.day,
        kind: "questionnaire",
        status: "Завершён",
      });
    if (e.kind === "contact")
      items.push({
        id: e.id,
        day: e.day,
        kind: "contact",
        status:
          e.preference === "earlier"
            ? "Хочу связаться раньше"
            : "К плановому приёму",
        note: e.description,
      });
  }
  return items.sort((a, b) => b.day.localeCompare(a.day));
}
