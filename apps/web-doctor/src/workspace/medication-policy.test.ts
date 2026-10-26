import { describe, expect, it } from "vitest";
import type { Actor, PatientRecord, PlanItem, Visit } from "./model";
import {
  assertMedicationVisit,
  assertMedicationStatusVisit,
} from "./medication-policy";

const actor = {
  id: "doctor-1",
  name: "Врач",
  specialty: "psychiatrist",
  clinicId: "clinic",
} as Actor;
const visit = (
  id: string,
  format: Visit["format"],
  status: Visit["status"],
  extra = {},
) => ({ id, format, status, diagnoses: [], ...extra }) as unknown as Visit;
const original = {
  id: "m1",
  kind: "medication",
  title: "Препарат",
  medicine: null,
  dose: "20 мг",
  schedule: "09:00",
  startDate: "2026-10-26",
  endDate: "",
  dueDate: "",
  instructionUrl: "https://example.test",
  patientInstructions: "Инструкция",
  details: "",
  sourceIds: [],
  status: "confirmed",
  visitId: "v1",
  confirmedById: actor.id,
  replacesId: "",
} as unknown as PlanItem;
const patient = {
  visits: [
    visit("v1", "in-person", "completed", {
      confirmedById: actor.id,
      diagnoses: [{ status: "confirmed" }],
    }),
    visit("remote", "remote", "in-progress"),
    visit("office", "in-person", "in-progress"),
  ],
  plan: [original],
} as PatientRecord;

describe("дистанционное изменение терапии", () => {
  it("требует очного приёма для нового назначения и подтверждения без привязки", () => {
    expect(() =>
      assertMedicationVisit(
        patient,
        { ...original, status: "draft", visitId: "remote", replacesId: "" },
        actor,
        false,
      ),
    ).toThrow();
    expect(() =>
      assertMedicationVisit(
        patient,
        { ...original, status: "draft", visitId: "" },
        actor,
        true,
      ),
    ).toThrow();
  });
  it("допускает только дозировку при подтверждённом очном основании того же врача", () => {
    const revision = {
      ...original,
      id: "m2",
      status: "draft" as const,
      visitId: "remote",
      replacesId: "m1",
      dose: "10 мг",
    };
    expect(() =>
      assertMedicationVisit(patient, revision, actor, true),
    ).not.toThrow();
    expect(() =>
      assertMedicationVisit(
        patient,
        { ...revision, schedule: "20:00" },
        actor,
        true,
      ),
    ).toThrow();
    expect(() =>
      assertMedicationVisit(patient, revision, { ...actor, id: "other" }, true),
    ).toThrow();
    const missingDoctor = {
      ...patient,
      plan: [{ ...original, confirmedById: undefined }],
    };
    expect(() =>
      assertMedicationVisit(missingDoctor, revision, actor, true),
    ).toThrow();
    const missingDiagnosis = {
      ...patient,
      visits: patient.visits.map((v) =>
        v.id === "v1" ? { ...v, diagnoses: [] } : v,
      ),
    };
    expect(() =>
      assertMedicationVisit(missingDiagnosis, revision, actor, true),
    ).toThrow();
  });
  it("изменяет статус препарата только на начатом очном приёме", () => {
    expect(() =>
      assertMedicationStatusVisit(patient, original, "remote"),
    ).toThrow();
    expect(() => assertMedicationStatusVisit(patient, original, "")).toThrow();
    expect(() =>
      assertMedicationStatusVisit(patient, original, "office"),
    ).not.toThrow();
  });
});
