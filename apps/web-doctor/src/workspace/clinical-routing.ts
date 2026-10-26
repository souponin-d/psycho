import type { PatientRecord, Actor } from "./model.ts";
import type {
  WorkflowAssessment,
  WorkflowAction,
  WorkflowRecommendation,
} from "./clinical-workflow.ts";
import type { ClinicalProtocol } from "./clinical-protocols.ts";
import { latestFact } from "./clinical-facts.ts";
export interface ClinicalRecommendationSpec {
  key: string;
  type: WorkflowRecommendation["type"];
  action: WorkflowAction;
  title: string;
  rationale: string;
  factIds: string[];
  priority: WorkflowRecommendation["priority"];
  assessmentId: string;
  source: ClinicalProtocol;
  referralCategory?: "required" | "desirable";
  destination?: string;
  ruleId?: string;
}
export function clinicalRecommendationSpecs(
  patient: PatientRecord,
  result: WorkflowAssessment,
  actor: Actor,
): ClinicalRecommendationSpec[] {
  const source = result.source;
  const scale = source.scale;
  const complete = result.completeness === "complete";
  const base = {
    assessmentId: result.id,
    source,
    factIds: [] as string[],
    priority: "routine" as const,
  };
  const rows: ClinicalRecommendationSpec[] = [
    {
      ...base,
      key: `result:${result.id}`,
      type: complete ? "observation" : "clarification",
      action: complete ? "discuss" : "verify",
      title: `Рассмотреть результат ${scale}`,
      rationale: complete
        ? `${scale}: ${result.score} из ${source.maximum}. ${result.interpretation?.label ?? ""}.`
        : "Не все обязательные ответы получены. Требуется уточнение.",
    },
  ];
  if (complete)
    rows.push({
      ...base,
      key: `repeat:${result.id}`,
      type: "next-scale",
      action: "scale",
      title: `Следующее измерение · ${scale}`,
      rationale: "Согласуйте необходимость и дату повторения.",
    });
  if (result.immediateDanger === "yes")
    rows.push({
      ...base,
      key: "immediate-danger-v1",
      ruleId: "immediate-danger-v1",
      type: "safety",
      action: "consultation",
      priority: "urgent",
      referralCategory: "required",
      destination: "Неотложная психиатрическая оценка",
      title: "Организовать срочную очную оценку",
      rationale:
        "Пациент сообщает о непосредственной опасности. Требуется срочная очная оценка.",
    });
  else if (scale === "PHQ-9" && (result.answers[8] ?? 0) > 0)
    rows.push({
      ...base,
      key: "phq9-item9-v1",
      ruleId: "phq9-item9-v1",
      type: "safety",
      action: "verify",
      priority: "important",
      title: "Уточнить ответ о самоповреждении",
      rationale:
        "Положительный ответ на пункт 9 PHQ-9. Уточните мысли, намерение, план и необходимость срочной помощи.",
    });
  const diagnoses = (patient.clinicalFacts ?? []).filter((f) => {
    const v = latestFact(f);
    return v.content.category === "diagnosis" && v.content.state === "known";
  });
  if (scale === "GAD-7") {
    const gad = diagnoses.filter((f) => {
      const v = latestFact(f),
        c = v.content;
      return (
        v.status === "confirmed" &&
        c.category === "diagnosis" &&
        c.state === "known" &&
        c.diagnosticStatus === "confirmed" &&
        c.condition.code === "F41.1"
      );
    });
    if (gad.length)
      rows.push({
        ...base,
        key: "gad-followup-v1",
        ruleId: "gad-followup-v1",
        type: "consultation",
        action:
          actor.specialty === "psychiatrist" ? "followup" : "consultation",
        ...(actor.specialty === "psychiatrist"
          ? {}
          : {
              referralCategory: "desirable" as const,
              destination: "Психиатр или психотерапевт",
            }),
        title: "Согласовать наблюдение специалиста",
        rationale:
          "Подтверждён ГТР. Требуется согласовать наблюдение психиатра или психотерапевта.",
        factIds: gad.map((f) => f.id),
      });
  } else if (scale === "PHQ-9") {
    const depression = diagnoses.filter((f) => {
      const v = latestFact(f),
        c = v.content;
      return (
        c.category === "diagnosis" &&
        c.state === "known" &&
        /^(F32|F33)(\.|$)/.test(c.condition.code) &&
        !["inactive", "contradictory", "clarification", "unknown"].includes(
          v.status,
        ) &&
        (v.status === "confirmed" ||
          (v.origin.kind === "clinician" &&
            c.diagnosticStatus === "hypothesis"))
      );
    });
    if (depression.length)
      rows.push({
        ...base,
        key: "depression-assessment-v1",
        ruleId: "depression-assessment-v1",
        type:
          actor.specialty === "psychiatrist" ? "clarification" : "consultation",
        action: actor.specialty === "psychiatrist" ? "discuss" : "consultation",
        priority: "important",
        ...(actor.specialty === "psychiatrist"
          ? {}
          : { referralCategory: "required" as const, destination: "Психиатр" }),
        title:
          actor.specialty === "psychiatrist"
            ? "Завершить клиническую оценку"
            : "Организовать оценку психиатра",
        rationale:
          actor.specialty === "psychiatrist"
            ? "Депрессивные симптомы требуют клинического заключения психиатра."
            : "В карте зафиксирован депрессивный синдром или рабочая гипотеза врача. Нужна оценка психиатра.",
        factIds: depression.map((f) => f.id),
      });
  }
  return rows;
}
