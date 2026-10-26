import type { Actor, PatientRecord, Mutation } from "./model";
import { applyCommand } from "./commands";
import { newSupportInput } from "./clinical-support-engine";

/** Синтетические сведения; неизвестные риски не подменяются ответом «нет». */
export function populateSupportScenario(
  patient: PatientRecord,
  actor: Actor,
  reference: Date,
  variant: "gad" | "depression" | "adverse" | "unknown",
): PatientRecord {
  const now = reference.toISOString();
  const input = newSupportInput();
  input.route = variant === "depression" ? "depression" : "gad";
  input.functioning = variant === "unknown" ? "unknown" : "impaired";
  input.preference = variant === "gad" ? "psychological" : "undecided";
  input.response = variant === "adverse" ? "no-response" : "unknown";
  input.observations = [];
  const mutations: Mutation[] = [];
  if (variant === "adverse")
    mutations.push({
      type: "support.adverse",
      id: `seed-ae-${patient.id}`,
      expectedVersion: 0,
      reason: "",
      input: {
        symptoms: "Тошнота после утреннего приёма препарата",
        onsetAt: new Date(reference.getTime() - 3600000).toISOString(),
        suspectPlanIds: patient.plan
          .filter((p) => p.kind === "medication" && p.status !== "draft")
          .map((p) => p.id),
        severity: "moderate",
        seriousness: "unknown",
        criteria: [],
        outcome: "ongoing",
        dechallenge: "not-done",
        rechallenge: "not-done",
        causality: "unassessed",
        provenance: "patient",
        assessment: "",
      },
    });
  mutations.push({
    type: "support.evaluate",
    id: `seed-support-${patient.id}`,
    input,
  });
  return mutations.reduce(
    (p, mutation, i) =>
      applyCommand(
        p,
        {
          commandId: `seed-support-${patient.id}-${i}`,
          expectedRevision: p.revision,
          mutation,
        },
        actor,
        now,
      ),
    patient,
  );
}
