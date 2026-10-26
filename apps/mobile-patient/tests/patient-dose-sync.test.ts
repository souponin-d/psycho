import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPatientDoseSync,
  DoseQueuedError,
} from "../src/core/patientDoseSync.ts";
import type { PatientOutboxOwner } from "../src/core/patientOutbox.ts";
const owner: PatientOutboxOwner = {
  origin: "https://clinic.example",
  clinicId: "c1",
  patientId: "p1",
  actorId: "u1",
};
const value = {
  scheduleId: "s1",
  scheduleVersion: 1,
  plannedAt: "2026-10-26T06:00:00.000Z",
  status: "taken" as const,
  reportedAt: "2026-10-26T06:01:00.000Z",
  expectedVersion: 0,
  reason: "",
};
function memory() {
  const data = new Map<string, string>();
  return {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}
test("отметка после обрыва сохраняется и повторяется с исходным идентификатором", async () => {
  const storage = memory(),
    sent: string[] = [];
  const offline = createPatientDoseSync(storage, owner, {
    currentOwner: () => owner,
    send: async (_v, id) => {
      sent.push(id);
      throw new Error("offline");
    },
  });
  await assert.rejects(offline.mark(value, "dose-1"), DoseQueuedError);
  await assert.rejects(
    offline.mark({ ...value, status: "missed" }, "dose-2"),
    /ожидает отправки/,
  );
  const online = createPatientDoseSync(storage, owner, {
    currentOwner: () => owner,
    send: async (_v, id) => {
      sent.push(id);
    },
  });
  await online.retry();
  assert.deepEqual(sent, ["dose-1", "dose-1"]);
  assert.deepEqual(await online.pending(), []);
});
test("очередь не отправляет отметки под другой учётной записью", async () => {
  const storage = memory();
  let active: PatientOutboxOwner | null = owner;
  const sync = createPatientDoseSync(storage, owner, {
    currentOwner: () => active,
    send: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(sync.mark(value, "dose-1"), DoseQueuedError);
  active = { ...owner, patientId: "other" };
  await assert.rejects(sync.retry());
  assert.equal((await sync.pending()).length, 1);
});
test("ошибочная корректировка не блокирует очередь", async () => {
  const sync = createPatientDoseSync(memory(), owner, {
    currentOwner: () => owner,
    send: async () => {},
  });
  await assert.rejects(
    sync.mark({ ...value, expectedVersion: 1, reason: "" }, "bad"),
  );
  assert.deepEqual(await sync.pending(), []);
});

test("неизвестное состояние доступно только как исправление существующей отметки", async () => {
  const sent: string[] = [];
  const sync = createPatientDoseSync(memory(), owner, {
    currentOwner: () => owner,
    send: async (item) => {
      sent.push(item.status);
    },
  });
  await assert.rejects(
    sync.mark({ ...value, status: "unknown", expectedVersion: 0 }, "bad"),
  );
  await sync.mark(
    {
      ...value,
      status: "unknown",
      expectedVersion: 1,
      reason: "Ошибка отметки",
    },
    "good",
  );
  assert.deepEqual(sent, ["unknown"]);
});
