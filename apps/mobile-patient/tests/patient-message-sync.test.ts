import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPatientMessageSync,
  MessageQueuedError,
} from "../src/core/patientMessageSync.ts";
import type { PatientOutboxOwner } from "../src/core/patientOutbox.ts";

const owner: PatientOutboxOwner = {
  origin: "https://clinic.example",
  clinicId: "c1",
  patientId: "p1",
  actorId: "u1",
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
test("обращение остаётся в очереди после потери ответа и повторяется при переподключении", async () => {
  const store = memory(),
    sent: string[] = [];
  const failed = createPatientMessageSync(store, owner, {
    currentOwner: () => owner,
    send: async (_text, id) => {
      sent.push(id);
      throw new Error("offline");
    },
  });
  await assert.rejects(failed.send("Здравствуйте", "id-1"), MessageQueuedError);
  const online = createPatientMessageSync(store, owner, {
    currentOwner: () => owner,
    send: async (_text, id) => {
      sent.push(id);
    },
  });
  await online.retry();
  assert.deepEqual(sent, ["id-1", "id-1"]);
  assert.deepEqual(await online.pending(), []);
});

test("ошибка записи на устройство не обозначается как сохранённая очередь", async () => {
  const sync = createPatientMessageSync(
    {
      async getItem() {
        return null;
      },
      async setItem() {
        throw new Error("disk error");
      },
    },
    owner,
    { currentOwner: () => owner, send: async () => {} },
  );
  await assert.rejects(
    sync.send("Текст", "id"),
    (error) => error instanceof Error && !(error instanceof MessageQueuedError),
  );
});
test("при переключении пациента очередь не отправляется под другой сессией", async () => {
  const store = memory();
  let active: PatientOutboxOwner | null = owner;
  const sent: string[] = [];
  const sync = createPatientMessageSync(store, owner, {
    currentOwner: () => active,
    send: async (_text, id) => {
      sent.push(id);
      throw new Error("offline");
    },
  });
  await assert.rejects(sync.send("Текст", "id-1"));
  active = { ...owner, patientId: "p2" };
  await assert.rejects(sync.retry());
  assert.deepEqual(sent, ["id-1"]);
  assert.equal((await sync.pending()).length, 1);
});
