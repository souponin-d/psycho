import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPatientReportSync,
  ReportQueuedError,
} from "../src/core/patientReportSync.ts";
const owner = {
  origin: "https://clinic.example",
  clinicId: "c",
  patientId: "p",
  actorId: "a",
};
const value = {
  id: "r1",
  entityId: "report:2026-10-26",
  day: "2026-10-26",
  formVersion: "syncli-report-v1" as const,
  reportedAt: "2026-10-26T12:00:00.000Z",
  fields: {
    feeling: { valence: 3, energy: 4 },
    sleep: "Хорошо",
    anxiety: 2,
    functioning: 7,
    tolerability: "Без трудностей",
  },
  note: "",
  label: "",
};
function memory() {
  const data = new Map<string, string>();
  return {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, item: string) {
      data.set(key, item);
    },
  };
}
test("самоотчёт переживает потерю ответа и отправляется повторно с тем же ID", async () => {
  const storage = memory(),
    sent: string[] = [];
  const offline = createPatientReportSync(storage, owner, {
    currentOwner: () => owner,
    send: async (_value, id) => {
      sent.push(id);
      throw new Error("offline");
    },
  });
  await assert.rejects(offline.send(value), ReportQueuedError);
  const online = createPatientReportSync(storage, owner, {
    currentOwner: () => owner,
    send: async (_value, id) => {
      sent.push(id);
    },
  });
  await online.retry();
  assert.deepEqual(sent, ["r1", "r1"]);
  assert.deepEqual(await online.pending(), []);
});
test("очередь самоотчётов не переходит другому пациенту", async () => {
  const storage = memory();
  let active = owner;
  const sync = createPatientReportSync(storage, owner, {
    currentOwner: () => active,
    send: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(sync.send(value), ReportQueuedError);
  active = { ...owner, patientId: "other" };
  await assert.rejects(sync.retry());
  assert.equal((await sync.pending()).length, 1);
});
