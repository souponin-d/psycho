// Synthetic fixture: medication changes must be tied to the correct visit.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed, start, stop, config, client } from "./hackathon-runtime.mjs";
import {
  createVisit,
  blankNotes,
} from "../apps/web-doctor/src/workspace/commands.ts";
import { ICD10_CATALOG } from "../apps/web-doctor/src/workspace/terminology.ts";

await seed();
const child = await start();
try {
  const doctor = client();
  const session = await doctor.login();
  const actor = session.body.actor;
  let patient = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  async function command(mutation, expected = 200) {
    const result = await doctor.call(
      `/patients/${patient.id}/commands`,
      "POST",
      { commandId: randomUUID(), expectedRevision: patient.revision, mutation },
    );
    assert.equal(result.status, expected, JSON.stringify(result.body));
    if (result.status === 200) patient = result.body;
    return result;
  }
  await command({
    type: "consent.add",
    value: {
      id: randomUUID(),
      purpose: "care",
      status: "documented",
      signedOn: new Date().toISOString().slice(0, 10),
      documentReference: "synthetic",
      person: "synthetic",
      scope: "synthetic",
      informing: "synthetic",
    },
  });
  const med = (
    await doctor.call("/terminology/grls?q=" + encodeURIComponent("Авиандр"))
  ).body.items[0];
  assert.ok(med);
  const makePlan = (visitId, overrides = {}) => ({
    id: randomUUID(),
    visitId,
    kind: "medication",
    title: med.tradeName,
    medicine: med,
    details: "",
    dose: "20 мг",
    schedule: "09:00",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    dueDate: "",
    status: "draft",
    confirmedAt: "",
    confirmedBy: "",
    changeReason: "",
    replacesId: "",
    instructionUrl: "https://example.test/",
    patientInstructions: "Синтетические указания",
    rationale: "Синтетическое решение",
    sourceIds: [],
    ...overrides,
  });
  const unbound = makePlan("");
  await command({ type: "plan.save", value: unbound });
  await command({ type: "plan.confirm", id: unbound.id }, 400);
  const remote = createVisit(randomUUID(), new Date().toISOString(), actor);
  remote.format = "remote";
  remote.status = "in-progress";
  await command({ type: "visit.save", value: remote });
  await command(
    { type: "visit.save", value: { ...remote, format: "in-person" } },
    400,
  );
  await command(
    { type: "visit.save", value: { ...remote, status: "scheduled" } },
    400,
  );
  await command({ type: "plan.save", value: makePlan(remote.id) }, 400);

  const inPerson = createVisit(randomUUID(), new Date().toISOString(), actor);
  inPerson.format = "in-person";
  inPerson.status = "in-progress";
  inPerson.notes = {
    ...blankNotes(),
    safetyConclusion: "synthetic",
    conclusion: "synthetic",
    recommendations: "synthetic",
  };
  inPerson.diagnoses = [
    { ...ICD10_CATALOG.find((d) => d.code === "F41.1"), status: "confirmed" },
  ];
  await command({ type: "visit.save", value: inPerson });
  const original = makePlan(inPerson.id);
  await command({ type: "plan.save", value: original });
  await command({ type: "plan.confirm", id: original.id });
  await command({ type: "visit.complete", id: inPerson.id });
  await command(
    {
      type: "plan.status",
      id: original.id,
      status: "stopped",
      reason: "synthetic",
      visitId: remote.id,
    },
    400,
  );
  await command(
    {
      type: "plan.status",
      id: original.id,
      status: "stopped",
      reason: "synthetic",
    },
    400,
  );
  const revision = makePlan(remote.id, {
    replacesId: original.id,
    changeReason: "synthetic",
    dose: "10 мг",
  });
  for (const patch of [
    { title: "Подмена" },
    { schedule: "20:00" },
    { patientInstructions: "Изменены" },
  ])
    await command(
      { type: "plan.save", value: { ...revision, id: randomUUID(), ...patch } },
      400,
    );
  await command({ type: "plan.save", value: revision });
  await command({ type: "plan.confirm", id: revision.id });
  assert.equal(
    patient.plan.find((item) => item.id === revision.id).dose,
    "10 мг",
  );
  assert.equal(
    patient.plan.find((item) => item.id === original.id).status,
    "stopped",
  );
  const office = createVisit(randomUUID(), new Date().toISOString(), actor);
  office.format = "in-person";
  office.status = "in-progress";
  await command({ type: "visit.save", value: office });
  await command({
    type: "plan.status",
    id: revision.id,
    status: "stopped",
    reason: "synthetic",
    visitId: office.id,
  });
  assert.equal(
    patient.plan.find((item) => item.id === revision.id).status,
    "stopped",
  );
  console.log(
    "PASS: remote new medication blocked; recorded in-person context permits dose-only change",
  );
} finally {
  await stop(child);
}
