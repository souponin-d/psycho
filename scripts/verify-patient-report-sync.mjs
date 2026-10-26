// Dedicated synthetic database only; no public server.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed, start, stop, config, client } from "./hackathon-runtime.mjs";
import { createPatientChannel } from "../apps/mobile-patient/src/core/patientChannel.ts";
import { createServerJourney } from "../apps/mobile-patient/src/core/serverJourney.ts";
import { applyPatientCommand } from "../apps/mobile-patient/src/core/patientCommands.ts";

await seed();
const child = await start();
try {
  const doctor = client();
  await doctor.login();
  const patient = client();
  await patient.call("/csrf");
  assert.equal(
    (await patient.call("/patient/access", "POST", { code: config.accessCode }))
      .status,
    200,
  );
  assert.equal((await patient.call("/patient/session")).status, 200);
  const id = randomUUID();
  const value = {
    id,
    entityId: "report:2026-10-26",
    day: "2026-10-26",
    formVersion: "syncli-report-v1",
    reportedAt: new Date().toISOString(),
    fields: {
      feeling: { valence: 4, energy: 2 },
      sleep: "Обычно",
      anxiety: 3,
      functioning: 7,
      tolerability: "Без трудностей",
    },
    note: "Синтетическая запись",
    label: "Состояние",
  };
  const command = {
    commandId: id,
    mutation: { type: "report.patient", value },
  };
  const result = await patient.call("/patient/commands", "POST", command);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(
    (await patient.call("/patient/commands", "POST", command)).status,
    200,
  );
  const bad = await patient.call("/patient/commands", "POST", {
    commandId: randomUUID(),
    mutation: {
      type: "report.patient",
      value: {
        ...value,
        id: randomUUID(),
        fields: { ...value.fields, feeling: { valence: 42, energy: 2 } },
      },
    },
  });
  assert.equal(bad.status, 400);
  const record = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  const reports = record.reports.filter((r) => r.id === id);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].provenance, "patient");
  assert.deepEqual(reports[0].mobile.fields, value.fields);
  assert.equal(reports[0].mobile.formVersion, value.formVersion);
  assert.equal(reports[0].mood, null);
  assert.equal(reports[0].sleepHours, null);
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
  const snapshot = await channel.connect(config.accessCode);
  assert.equal(snapshot.reports.kind, "ready");
  const clock = { utcMs: Date.now(), zone: "UTC", offsetMinutes: 0 };
  const restored = applyPatientCommand(
    createServerJourney(value.day),
    { type: "server:reports", reports: snapshot.reports.reports },
    clock,
  );
  assert.deepEqual(
    restored.events.find((event) => event.id === id)?.fields,
    value.fields,
  );
  assert.deepEqual(restored.rewards, []);
  console.log(
    "PASS patient report preserves raw fields, recovers on a fresh profile, is idempotent, and rejects invalid values",
  );
} finally {
  await stop(child);
}
