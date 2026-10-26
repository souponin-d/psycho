import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { patientMeasurements } from "./patient-measurements";
import { applyCommand, createPatient, createVisit } from "./commands";
import { clinicalProtocols } from "./clinical-protocols";
import { demoActor, seedPatients } from "./seed";
import { Dynamics } from "./Dynamics";
import type { PatientRecord, Mutation } from "./model";
import type { WorkspaceActions } from "./useWorkspace";

afterEach(cleanup);
const now = "2026-10-26T10:00:00.000Z";
function submit(patient: PatientRecord, visitId?: string) {
  const mutation: Mutation = {
    type: "workflow.submit",
    value: {
      id: "new-questionnaire",
      protocolVersion: clinicalProtocols[1]!.version,
      measuredAt: now,
      answers: Array(9).fill(0),
      state: "completed",
      safety: "unknown",
      note: "",
      assignmentId: "",
      ...(visitId === undefined ? {} : { visitId }),
    },
  };
  return applyCommand(
    patient,
    {
      commandId: crypto.randomUUID(),
      expectedRevision: patient.revision,
      mutation,
    },
    demoActor,
    now,
  );
}
it("projects the stored result and chooses its newer series over older manual measurements", () => {
  const patient = submit(seedPatients(new Date(now))[0]!);
  const snapshot = JSON.stringify(patient);
  const results = patientMeasurements(patient);
  const stored = patient.workflow!.assessments.at(-1)!;
  expect(results.find((m) => m.id === "workflow:" + stored.id)).toMatchObject({
    score: stored.score,
    answers: stored.answers,
    version: stored.source.version,
    maximum: stored.source.maximum,
    assessor: "patient",
    visitId: "",
  });
  expect(JSON.stringify(patient)).toBe(snapshot);
  render(
    <Dynamics
      patient={patient}
      actions={{ busy: false, mutate: vi.fn() } as unknown as WorkspaceActions}
    />,
  );
  expect(
    (screen.getByLabelText("Ряд измерений") as HTMLSelectElement)
      .selectedOptions[0]!.textContent,
  ).toContain(stored.source.version);
  expect(screen.getByText(stored.source.title)).toBeTruthy();
});
it.each(["completed", "cancelled", "printed", "missing"])(
  "rejects association with a %s visit",
  (kind) => {
    const patient = createPatient(
      { name: "Пациент", birthDate: "1990-01-01" },
      demoActor,
      now,
      "visit-association",
    );
    const visit = createVisit("visit", now, demoActor);
    if (kind === "completed" || kind === "cancelled") visit.status = kind;
    if (kind !== "missing") patient.visits.push(visit);
    if (kind === "printed")
      patient.audit.push({
        id: "printed",
        createdAt: now,
        author: demoActor.name,
        action: "visit.print",
        targetId: visit.id,
        detail: "Копия",
      });
    expect(() => submit(patient, "visit")).toThrow(/приём/i);
  },
);
it("keeps a valid writable visit association in the derived record", () => {
  const patient = createPatient(
    { name: "Пациент", birthDate: "1990-01-01" },
    demoActor,
    now,
    "valid-association",
  );
  patient.visits.push(createVisit("visit", now, demoActor));
  const saved = submit(patient, "visit");
  expect(
    patientMeasurements(saved).find(
      (m) => m.id === "workflow:new-questionnaire",
    )!.visitId,
  ).toBe("visit");
});
