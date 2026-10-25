import { validFeeling } from "./feelings.ts";
import type {
  DayAssessment,
  DayKey,
  PatientEvent,
  PlanVersion,
  ReportFields,
  ReportField,
  JourneyState,
} from "./journeyModel.ts";

export function planForDay(state: JourneyState, day: DayKey): PlanVersion {
  if (day >= (state.plan.effectiveFrom ?? state.plan.startedAt))
    return state.plan;
  return (
    (state.planVersions ?? [])
      .filter((p) => (p.effectiveFrom ?? p.startedAt) <= day)
      .sort((a, b) =>
        (a.effectiveFrom ?? a.startedAt).localeCompare(
          b.effectiveFrom ?? b.startedAt,
        ),
      )
      .at(-1) ?? state.plan
  );
}

export function fieldComplete(
  fields: ReportFields,
  field: ReportField,
): boolean {
  switch (field) {
    case "feeling":
      return validFeeling(fields.feeling);
    case "sleep":
      return (
        typeof fields.sleep === "string" &&
        ["Плохо", "Обычно", "Хорошо"].includes(fields.sleep)
      );
    case "anxiety":
      return (
        typeof fields.anxiety === "number" &&
        Number.isInteger(fields.anxiety) &&
        fields.anxiety >= 0 &&
        fields.anxiety <= 10
      );
    case "functioning":
      return (
        typeof fields.functioning === "number" &&
        Number.isInteger(fields.functioning) &&
        fields.functioning >= 0 &&
        fields.functioning <= 10
      );
    case "tolerability":
      return (
        typeof fields.tolerability === "string" &&
        ["Без трудностей", "Есть трудности"].includes(fields.tolerability)
      );
  }
}
export function assessDay(
  plan: PlanVersion,
  events: PatientEvent[],
  day: DayKey,
): DayAssessment {
  const relevant = events
    .filter(
      (e) => e.day === day && e.recordedDay === day && e.gameEligible !== false,
    )
    .sort((a, b) => a.at - b.at);
  const missing: string[] = [];
  if (day >= plan.startedAt) {
    for (const slot of plan.medication.slots) {
      const dose = relevant
        .filter((e) => e.kind === "dose" && e.slotId === slot.id)
        .at(-1);
      if (!dose || dose.kind !== "dose" || dose.status === "unknown")
        missing.push("dose:unknown:" + slot.id);
      else if (dose.status !== "taken") missing.push("dose:missed:" + slot.id);
    }
  }
  const report = relevant
    .filter((e) => e.kind === "report" && e.required)
    .at(-1);
  if (
    !report ||
    report.kind !== "report" ||
    report.deleted ||
    !plan.reportFields.every((f) => fieldComplete(report.fields, f))
  )
    missing.push("report");
  for (const assignment of plan.tests.filter((t) => t.day === day)) {
    const test = relevant
      .filter(
        (e) => e.kind === "questionnaire" && e.assignmentId === assignment.id,
      )
      .at(-1);
    if (
      !test ||
      test.kind !== "questionnaire" ||
      test.formId !== assignment.formId ||
      test.answers.length !== assignment.questionCount ||
      test.answers.some((v) => !Number.isInteger(v) || v < 0 || v > 3)
    )
      missing.push("test:" + assignment.id);
  }
  return { day, complete: missing.length === 0, missing };
}
