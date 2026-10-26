// Isolated synthetic fixture; the public server is never used by this script.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed, start, stop, config, client } from "./hackathon-runtime.mjs";
import { clinicalProtocols } from "../apps/web-doctor/src/workspace/clinical-protocols.ts";
await seed();
const child = await start();
try {
  const doctor = client();
  await doctor.login();
  let record = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  async function command(mutation) {
    const result = await doctor.call(
      `/patients/${record.id}/commands`,
      "POST",
      { commandId: randomUUID(), expectedRevision: record.revision, mutation },
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
    record = result.body;
  }
  const protocol = clinicalProtocols.find((p) => p.id === "gad7");
  await command({
    type: "workflow.submit",
    value: {
      id: randomUUID(),
      protocolVersion: protocol.version,
      measuredAt: new Date(Date.now() - 10000).toISOString(),
      answers: Array(7).fill(1),
      state: "completed",
      safety: "no",
      immediateDanger: "no",
      note: "synthetic",
      assignmentId: "",
    },
  });
  let rec = record.workflow.recommendations.find(
    (r) =>
      !r.stale &&
      r.type === "next-scale" &&
      r.source.version === protocol.version,
  );
  assert.ok(rec);
  await command({
    type: "workflow.decide",
    id: rec.id,
    expectedVersion: rec.version,
    decision: "accept",
    reason: "",
    action: "scale",
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });
  rec = record.workflow.recommendations.find((r) => r.id === rec.id);
  await command({
    type: "workflow.execute",
    id: rec.id,
    expectedVersion: rec.version,
    confirmation: true,
  });
  const assignment = record.workflow.assignments.at(-1);
  const patient = client();
  await patient.call("/csrf");
  assert.equal(
    (await patient.call("/patient/access", "POST", { code: config.accessCode }))
      .status,
    200,
  );
  await patient.call("/patient/session");
  const visible = (await patient.call("/patient/record")).body;
  assert.ok(
    visible.questionnaires.some(
      (q) => q.id === assignment.id && q.protocolVersion === protocol.version,
    ),
  );
  assert.equal(visible.workflow, undefined);
  const id = randomUUID();
  const value = {
    id,
    assignmentId: assignment.id,
    protocolVersion: protocol.version,
    measuredAt: new Date().toISOString(),
    answers: [1, 0, 2, 1, 0, 1, 0],
    impact: null,
  };
  const payload = {
    commandId: id,
    mutation: { type: "questionnaire.patient", value },
  };
  const result = await patient.call("/patient/commands", "POST", payload);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(
    (await patient.call("/patient/commands", "POST", payload)).status,
    200,
  );
  const rejected = await patient.call("/patient/commands", "POST", {
    commandId: randomUUID(),
    mutation: {
      type: "questionnaire.patient",
      value: { ...value, id: randomUUID(), assignmentId: "foreign" },
    },
  });
  assert.equal(rejected.status, 400);
  record = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  const results = record.workflow.assessments.filter((a) => a.id === id);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].answers, value.answers);
  assert.equal(results[0].assignmentId, assignment.id);
  assert.equal(results[0].receivedBy.specialty, "patient");
  assert.equal(
    record.workflow.assignments.find((a) => a.id === assignment.id).status,
    "submitted",
  );
  assert.notEqual(record.workflow.reviewSpecialty, "patient");
  console.log(
    "PASS issued questionnaire, raw answers, idempotency and physician record",
  );
} finally {
  await stop(child);
}
