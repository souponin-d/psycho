// Dedicated synthetic database: never point this test at a public API.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  seed,
  start,
  stop,
  config,
  client,
  sql,
} from "./hackathon-runtime.mjs";
import { createVisit } from "../apps/web-doctor/src/workspace/commands.ts";
import { createPatientChannel } from "../apps/mobile-patient/src/core/patientChannel.ts";

await seed();
const child = await start();
try {
  const doctor = client(),
    session = await doctor.login();
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
  const visit = createVisit(
    randomUUID(),
    new Date().toISOString(),
    session.body.actor,
  );
  visit.status = "in-progress";
  await command({ type: "visit.save", value: visit });
  const med = (
    await doctor.call("/terminology/grls?q=" + encodeURIComponent("Авиандр"))
  ).body.items[0];
  const plan = {
    id: randomUUID(),
    visitId: visit.id,
    kind: "medication",
    title: med.tradeName,
    medicine: med,
    details: "",
    dose: "20 мг",
    schedule: "00:01",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    dueDate: "",
    status: "draft",
    confirmedAt: "",
    confirmedBy: "",
    changeReason: "",
    replacesId: "",
    instructionUrl: "https://example.test/",
    patientInstructions: "synthetic",
    rationale: "synthetic",
    sourceIds: [],
  };
  await command({ type: "plan.save", value: plan });
  await command({ type: "plan.confirm", id: plan.id });
  // Backdate only this isolated synthetic fixture to exercise an already elapsed slot without waiting for the clock.
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const index = record.plan.findIndex((p) => p.id === plan.id);
  sql(
    `UPDATE patient_records SET document=jsonb_set(jsonb_set(document,'{plan,${index},confirmedAt}',to_jsonb('${yesterday}T00:00:00.000Z'::text)),'{plan,${index},startDate}',to_jsonb('${yesterday}'::text)) WHERE id='${record.id}'`,
  );
  record = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  const scheduleId = randomUUID();
  await command({
    type: "adherence.schedule",
    value: {
      id: scheduleId,
      expectedVersion: 0,
      planId: plan.id,
      times: ["00:01"],
      offsetMinutes: 0,
      effectiveFrom: `${yesterday}T00:00:00.000Z`,
      endDate: new Date().toISOString().slice(0, 10),
      reason: "synthetic",
    },
  });
  const patient = client();
  await patient.call("/csrf");
  assert.equal(
    (await patient.call("/patient/access", "POST", { code: config.accessCode }))
      .status,
    200,
  );
  assert.equal((await patient.call("/patient/session")).status, 200);
  const projection = (await patient.call("/patient/record")).body;
  assert.ok(
    projection.doseSchedules.some(
      (s) => s.id === scheduleId && s.planId === plan.id,
    ),
  );
  assert.equal(projection.adherence, undefined);
  const value = {
    scheduleId,
    scheduleVersion: 1,
    plannedAt: `${yesterday}T00:01:00.000Z`,
    status: "taken",
    reportedAt: new Date().toISOString(),
    expectedVersion: 0,
    reason: "",
  };
  assert.equal(
    (
      await patient.call("/patient/commands", "POST", {
        commandId: randomUUID(),
        mutation: {
          type: "dose.patient",
          value: { ...value, provenance: "clinician" },
        },
      })
    ).status,
    400,
  );
  const channel = createPatientChannel({
    baseUrl: `http://127.0.0.1:${config.apiPort}`,
    allowLocalHttp: true,
    request: async (url, options) => {
      const response = await patient.call(
        new URL(url).pathname.replace(/^\/api/, ""),
        options.method,
        options.body ? JSON.parse(String(options.body)) : undefined,
      );
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
      };
    },
  });
  const initial = await channel.connect(config.accessCode);
  assert.equal(initial.doses.kind, "ready");
  const id = randomUUID();
  const first = await channel.markDose(value, id);
  assert.equal(first.doses.kind, "ready");
  assert.ok(
    first.doses.records.some(
      (row) => row.scheduleId === scheduleId && row.status === "taken",
    ),
  );
  await channel.markDose(value, id);
  assert.equal(
    (
      await patient.call("/patient/commands", "POST", {
        commandId: randomUUID(),
        mutation: {
          type: "adherence.record",
          value: { ...value, provenance: "clinician" },
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await patient.call("/patient/commands", "POST", {
        commandId: randomUUID(),
        mutation: {
          type: "dose.patient",
          value: { ...value, scheduleId: randomUUID() },
        },
      })
    ).status,
    400,
  );
  const corrected = await patient.call("/patient/commands", "POST", {
    commandId: randomUUID(),
    mutation: {
      type: "dose.patient",
      value: {
        ...value,
        status: "missed",
        expectedVersion: 1,
        reason: "Уточнение пациента",
      },
    },
  });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  record = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  const matches = record.adherence.records.filter(
    (r) => r.scheduleId === scheduleId,
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, "missed");
  assert.equal(matches[0].provenance, "patient");
  assert.equal(matches[0].history.length, 2);
  assert.equal(matches[0].history[0].status, "taken");
  const cleared = await patient.call("/patient/commands", "POST", {
    commandId: randomUUID(),
    mutation: {
      type: "dose.patient",
      value: {
        ...value,
        status: "unknown",
        expectedVersion: 2,
        reason: "Ошибка отметки",
      },
    },
  });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  record = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  const updated = record.adherence.records.find(
    (r) => r.scheduleId === scheduleId,
  );
  assert.equal(updated.status, "unknown");
  assert.equal(updated.history.length, 3);
  console.log(
    "PASS: patient sees explicit schedule, dose reaches doctor once with patient provenance",
  );
} finally {
  await stop(child);
}
