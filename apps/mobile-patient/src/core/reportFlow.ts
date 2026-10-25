import { fieldComplete } from "./therapy.ts";
import type { ReportField, ReportFields, ReportEvent } from "./journeyModel.ts";
export type ReportStep = "feeling" | "details" | "note";
export const reportFieldLabels: Record<ReportField, string> = {
  feeling: "Состояние",
  sleep: "Сон",
  anxiety: "Тревога",
  functioning: "Повседневные дела",
  tolerability: "Переносимость",
};
export function reportSteps(
  required: boolean,
  fields: ReportField[],
  legacyWithoutFeeling = false,
): ReportStep[] {
  return [
    ...(!legacyWithoutFeeling && (!required || fields.includes("feeling"))
      ? ["feeling" as const]
      : []),
    ...(required && fields.some((f) => f !== "feeling")
      ? ["details" as const]
      : []),
    "note",
  ];
}
export function reportStepError(
  step: ReportStep,
  fields: ReportFields,
  required: ReportField[],
): string | null {
  if (step === "feeling" && !fieldComplete(fields, "feeling"))
    return "Выберите состояние на карте ощущений.";
  if (step === "details") {
    const missing = required.filter(
      (f) => f !== "feeling" && !fieldComplete(fields, f),
    );
    if (missing.length)
      return (
        "Заполните разделы: " +
        missing.map((f) => reportFieldLabels[f]).join(", ")
      );
  }
  return null;
}
export function reportDraftKey(
  day: string,
  required: boolean,
  entityId?: string,
) {
  return entityId
    ? "edit:" + entityId
    : (required ? "report:" : "moment:") + day;
}
export function sameReport(
  a: ReportEvent,
  b: Omit<ReportEvent, "at" | "recordedDay">,
) {
  if (
    a.required !== b.required ||
    !!a.deleted !== !!b.deleted ||
    a.note !== b.note ||
    (a.label ?? "") !== (b.label ?? "")
  )
    return false;
  const x = a.fields,
    y = b.fields;
  return (
    x.feeling?.valence === y.feeling?.valence &&
    x.feeling?.energy === y.feeling?.energy &&
    x.sleep === y.sleep &&
    x.anxiety === y.anxiety &&
    x.functioning === y.functioning &&
    x.tolerability === y.tolerability
  );
}
