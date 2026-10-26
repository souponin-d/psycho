import fixtures from "../../../../tests/clinical-scenarios.json" with { type: "json" };
import clinicalFixtures from "../../../../tests/clinical-validation-scenarios.json" with { type: "json" };
import { clinicalProtocols } from "./clinical-protocols.ts";
import { ICD10_CATALOG } from "./terminology.ts";
import { applyCommand } from "./commands.ts";
import type { Actor, PatientRecord, Mutation } from "./model.ts";
import type { WorkflowSubmission } from "./clinical-workflow.ts";
export const clinicalScenarios = [...clinicalFixtures, ...fixtures];
export function scenarioMutations(
  id: string,
  reference = new Date(),
  prefix: string = crypto.randomUUID(),
): Mutation[] {
  const clinical = clinicalFixtures.find((s) => s.id === id);
  if (clinical) {
    const protocol = clinicalProtocols.find((p) => p.scale === clinical.scale)!;
    const at = (days: number) =>
      new Date(reference.getTime() - days * 86400000).toISOString();
    const mutations: Mutation[] = [];
    if (clinical.diagnosis) {
      const condition = ICD10_CATALOG.find(
        (c) => c.code === clinical.diagnosis,
      )!;
      mutations.push({
        type: "fact.save",
        value: {
          id: `${prefix}-diagnosis`,
          expectedVersion: 0,
          content: {
            category: "diagnosis",
            state: "known",
            condition,
            diagnosticStatus: clinical.diagnosticStatus as
              "hypothesis" | "confirmed",
          },
          origin: {
            kind: "clinician",
            reference: "Предыдущий приём",
            quote:
              clinical.diagnosticStatus === "confirmed"
                ? "ГТР подтверждён при клиническом интервью."
                : "Депрессивный синдром: рабочая гипотеза, требуется оценка психиатра.",
            observedAt: at(28),
          },
          reason: "",
        },
      });
      if (clinical.diagnosticStatus === "confirmed")
        mutations.push({
          type: "fact.review",
          id: `${prefix}-diagnosis`,
          expectedVersion: 1,
          decision: "confirm",
          reason: "",
        });
    }
    const baseline: WorkflowSubmission = {
      id: `${prefix}-baseline`,
      protocolVersion: protocol.version,
      measuredAt: at(14),
      answers: clinical.baseline,
      state: "completed",
      safety: "no",
      immediateDanger: "no",
      note: "Первичная оценка состояния",
      assignmentId: "",
      ...(clinical.scale === "PHQ-9" ? { impact: 1 } : {}),
    };
    mutations.push(
      { type: "workflow.submit", value: baseline },
      { type: "workflow.contact", note: "Предыдущий контакт" },
      {
        type: "workflow.submit",
        value: {
          ...baseline,
          id: `${prefix}-current`,
          measuredAt: at(1),
          answers: clinical.answers,
          safety: clinical.safety as WorkflowSubmission["safety"],
          immediateDanger:
            clinical.immediateDanger as WorkflowSubmission["immediateDanger"],
          note: clinical.note,
          ...(clinical.scale === "PHQ-9"
            ? { impact: clinical.impact ?? null }
            : {}),
        },
      },
    );
    return mutations;
  }
  const scenario = fixtures.find((s) => s.id === id);
  if (!scenario) throw new Error("Неизвестный учебный сценарий.");
  const at = (days: number) =>
    new Date(reference.getTime() - days * 86400000).toISOString();
  const value: WorkflowSubmission = {
    id: `${prefix}-baseline`,
    protocolVersion: "synthetic-7-v1",
    measuredAt: at(14),
    answers: [1, 1, 1, 1, 1, 1, 1],
    state: "completed",
    safety: "no",
    note: "Исходный полный учебный самоотчёт",
    assignmentId: "",
  };
  const mutations: Mutation[] = [
    { type: "workflow.submit", value },
    { type: "workflow.contact", note: "Учебный предыдущий контакт" },
  ];
  if (id === "contradiction")
    mutations.push(
      {
        type: "fact.save",
        value: {
          id: `${prefix}-allergy`,
          expectedVersion: 0,
          content: {
            category: "allergy",
            state: "known",
            substance: "Учебный аллерген",
            reaction: "Со слов учебного пациента — реакция в прошлом",
          },
          origin: {
            kind: "patient",
            reference: "Синтетический повторный самоотчёт",
            quote: "Сообщает о реакции; прежнюю запись необходимо сверить",
            observedAt: at(1),
          },
          reason: "",
        },
      },
      {
        type: "fact.review",
        id: `${prefix}-allergy`,
        expectedVersion: 1,
        decision: "contradict",
        reason:
          "Синтетический источник противоречит прежнему анамнезу; требуется уточнение",
      },
    );
  mutations.push({
    type: "workflow.submit",
    value: {
      ...value,
      id: `${prefix}-current`,
      measuredAt: at(1),
      answers: scenario.answers,
      state: scenario.state as WorkflowSubmission["state"],
      safety: scenario.safety as WorkflowSubmission["safety"],
      note: scenario.note,
    },
  });
  return mutations;
}
export function populateSyntheticScenario(
  patient: PatientRecord,
  id: string,
  actor: Actor,
  reference: Date,
): PatientRecord {
  const prefix = `seed-${patient.id}-${id}`;
  return scenarioMutations(id, reference, prefix).reduce(
    (p, mutation, index) =>
      applyCommand(
        p,
        {
          commandId: `${prefix}-${index}`,
          expectedRevision: p.revision,
          mutation,
        },
        actor,
        reference.toISOString(),
      ),
    patient,
  );
}
