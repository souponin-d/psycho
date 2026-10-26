// Synthetic PostgreSQL fixture only: lost response after server commit must not duplicate a message.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed, start, stop, config, client } from "./hackathon-runtime.mjs";
import { createPatientChannel } from "../apps/mobile-patient/src/core/patientChannel.ts";
import { createPatientMessageSync } from "../apps/mobile-patient/src/core/patientMessageSync.ts";

await seed();
const child = await start();
try {
  const patient = client();
  let loseResponse = true;
  const channel = createPatientChannel({
    baseUrl: `http://127.0.0.1:${config.apiPort}`,
    allowLocalHttp: true,
    request: async (url, options) => {
      const path = new URL(url).pathname.replace(/^\/api/, "");
      const response = await patient.call(
        path,
        options.method,
        options.body ? JSON.parse(String(options.body)) : undefined,
      );
      if (
        path === "/patient/commands" &&
        response.status === 200 &&
        loseResponse
      ) {
        loseResponse = false;
        throw new Error("response lost after commit");
      }
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
      };
    },
  });
  await channel.connect(config.accessCode);
  const owner = channel.owner();
  assert(owner);
  const values = new Map();
  const storage = {
    async getItem(k) {
      return values.get(k) ?? null;
    },
    async setItem(k, v) {
      values.set(k, v);
    },
  };
  const sync = createPatientMessageSync(storage, owner, {
    currentOwner: () => channel.owner(),
    send: (text, id) => channel.send(text, id),
  });
  const id = randomUUID();
  await assert.rejects(
    sync.send("Синтетическая проверка повторной отправки", id),
  );
  assert.equal((await sync.pending()).length, 1);
  await sync.retry();
  assert.equal((await sync.pending()).length, 0);
  const doctor = client();
  const doctorSession = await doctor.login();
  const record = (await doctor.call("/patients")).body.find(
    (p) => p.id === config.patientId,
  );
  assert.equal(record.messages.filter((m) => m.id === id).length, 1);
  const replyId = randomUUID();
  const reply = await doctor.call(
    `/patients/${config.patientId}/commands`,
    "POST",
    {
      commandId: replyId,
      expectedRevision: record.revision,
      mutation: { type: "message.send", text: "Синтетический ответ врача" },
    },
  );
  assert.equal(reply.status, 200);
  const refreshed = await channel.read();
  assert.ok(
    refreshed.messages.some(
      (m) => m.id === replyId && m.direction === "doctor",
    ),
  );
  const planId = randomUUID();
  const plan = {
    id: planId,
    visitId: "",
    kind: "lifestyle",
    title: "Синтетическая запись",
    details: "",
    dose: "",
    schedule: "",
    startDate: "2026-10-26",
    endDate: "",
    dueDate: "",
    status: "draft",
    confirmedAt: "",
    confirmedBy: "",
    confirmedById: "forged-client-id",
    changeReason: "",
    replacesId: "",
    instructionUrl: "",
    patientInstructions: "Только проверка обмена",
    rationale: "Синтетическая проверка",
    sourceIds: [],
  };
  const draft = await doctor.call(
    `/patients/${config.patientId}/commands`,
    "POST",
    {
      commandId: randomUUID(),
      expectedRevision: reply.body.revision,
      mutation: { type: "plan.save", value: plan },
    },
  );
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  assert.equal(
    draft.body.plan.find((item) => item.id === planId).confirmedById,
    "",
    "client cannot claim a confirming doctor",
  );
  const confirmation = await doctor.call(
    `/patients/${config.patientId}/commands`,
    "POST",
    {
      commandId: randomUUID(),
      expectedRevision: draft.body.revision,
      mutation: { type: "plan.confirm", id: planId },
    },
  );
  assert.equal(confirmation.status, 200, JSON.stringify(confirmation.body));
  assert.equal(
    confirmation.body.plan.find((item) => item.id === planId).confirmedById,
    doctorSession.body.actor.id,
    "doctor identity must be stamped by the server",
  );
  const updated = await channel.read();
  assert.equal(updated.plan.kind, "ready");
  assert.ok(
    updated.plan.items.some(
      (item) => item.id === planId && item.title === "Синтетическая запись",
    ),
  );
  console.log(
    "PASS: lost response, persistent retry, doctor reply and confirmed plan reach patient channel",
  );
} finally {
  await stop(child);
}
