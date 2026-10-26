import { test } from "node:test";
import assert from "node:assert/strict";
import { createPatientOutbox } from "../src/core/patientOutbox.ts";
import type { PatientOutboxCommand } from "../src/core/patientOutbox.ts";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}
const alice = {
  origin: "https://clinic.example",
  clinicId: "c1",
  patientId: "p1",
  actorId: "a1",
};
const first = {
  commandId: "id-1",
  mutation: { type: "message.patient", text: "Сообщение" },
};
const second = {
  commandId: "id-2",
  mutation: { type: "message.patient", text: "Другое" },
};

test("сбой сети и перезапуск сохраняют исходную команду и её ID для повторной отправки", async () => {
  const storage = memory();
  const outbox = createPatientOutbox(storage, alice);
  await outbox.enqueue(first);
  await assert.rejects(
    outbox.flush(async () => {
      throw new Error("offline");
    }),
  );
  const restored = createPatientOutbox(storage, alice);
  assert.deepEqual(await restored.list(), [first]);
  const sent: string[] = [];
  await restored.flush(async (command) => {
    sent.push(command.commandId);
  });
  assert.deepEqual(sent, ["id-1"]);
  assert.deepEqual(await restored.list(), []);
});

test("очереди разных пациентов, клиник, акторов и серверов разделены", async () => {
  const storage = memory();
  await createPatientOutbox(storage, alice).enqueue(first);
  for (const other of [
    { ...alice, patientId: "p2" },
    { ...alice, clinicId: "c2" },
    { ...alice, actorId: "a2" },
    { ...alice, origin: "https://other.example" },
  ])
    assert.deepEqual(await createPatientOutbox(storage, other).list(), []);
  assert.deepEqual(await createPatientOutbox(storage, alice).list(), [first]);
});

test("очереди разных типов действий одного пациента независимы", async () => {
  const storage = memory();
  await createPatientOutbox(storage, alice, "messages").enqueue(first);
  assert.deepEqual(
    await createPatientOutbox(storage, alice, "reports").list(),
    [],
  );
  assert.deepEqual(
    await createPatientOutbox(storage, alice, "messages").list(),
    [first],
  );
});

test("идентичный повтор не дублируется, другая команда с тем же ID отклоняется", async () => {
  const outbox = createPatientOutbox(memory(), alice);
  await outbox.enqueue(first);
  await outbox.enqueue(first);
  await assert.rejects(
    outbox.enqueue({ ...second, commandId: first.commandId }),
  );
  assert.deepEqual(await outbox.list(), [first]);
});
test("конкурирующие действия для одного слота не ставятся в очередь одновременно", async () => {
  const outbox = createPatientOutbox(memory(), alice, "doses");
  const a = {
    commandId: "a",
    mutation: { type: "dose.patient", value: { slot: "s1" } },
  };
  const b = {
    commandId: "b",
    mutation: { type: "dose.patient", value: { slot: "s1" } },
  };
  const conflict = (item: PatientOutboxCommand) =>
    (item.mutation.value as { slot: string }).slot === "s1";
  const results = await Promise.allSettled([
    outbox.enqueue(a, conflict),
    outbox.enqueue(b, conflict),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal((await outbox.list()).length, 1);
});
test("явная отмена удаляет только выбранную ожидающую команду", async () => {
  const outbox = createPatientOutbox(memory(), alice);
  await outbox.enqueue(first);
  await outbox.enqueue(second);
  await outbox.remove(first.commandId);
  assert.deepEqual(await outbox.list(), [second]);
});

test("очистка одной очереди не затрагивает другой поток", async () => {
  const storage = memory();
  const reports = createPatientOutbox(storage, alice, "reports");
  const messages = createPatientOutbox(storage, alice, "messages");
  await reports.enqueue({
    commandId: "r1",
    mutation: { type: "report.patient" },
  });
  await messages.enqueue({
    commandId: "m1",
    mutation: { type: "message.patient" },
  });
  await reports.clear();
  assert.deepEqual(await reports.list(), []);
  assert.equal((await messages.list()).length, 1);
});

test("параллельные отправки и постановка в очередь сохраняют порядок и не дублируют команды", async () => {
  const outbox = createPatientOutbox(memory(), alice);
  await outbox.enqueue(first);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: string[] = [];
  const flush = outbox.flush(async (command) => {
    sent.push(command.commandId);
    await wait;
  });
  const next = outbox.enqueue(second);
  const otherFlush = outbox.flush(async (command) => {
    sent.push(command.commandId);
  });
  release();
  await Promise.all([flush, next, otherFlush]);
  assert.deepEqual(sent, ["id-1", "id-2"]);
  assert.deepEqual(await outbox.list(), []);
});

test("две копии очереди одной учётной записи не теряют параллельные записи", async () => {
  const storage = memory();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  let writes = 0;
  const port = {
    ...storage,
    async setItem(key: string, value: string) {
      if (++writes === 1) {
        started();
        await gate;
      }
      await storage.setItem(key, value);
    },
  };
  const a = createPatientOutbox(port, alice),
    b = createPatientOutbox(port, alice);
  const one = a.enqueue(first);
  await writing;
  const two = b.enqueue(second);
  release();
  await Promise.all([one, two]);
  assert.deepEqual(await a.list(), [first, second]);
});

test("повреждённую очередь и ошибку записи нельзя молча заменить или отправить", async () => {
  const storage = memory();
  const outbox = createPatientOutbox(storage, alice);
  await outbox.enqueue(first);
  const key = [...storage.data.keys()][0]!;
  storage.data.set(key, "broken");
  await assert.rejects(outbox.enqueue(second));
  await assert.rejects(
    outbox.flush(async () => assert.fail("нельзя отправлять")),
  );
  assert.equal(storage.data.get(key), "broken");
  const failed = createPatientOutbox(
    {
      ...memory(),
      async setItem() {
        throw new Error("disk");
      },
    },
    alice,
  );
  await assert.rejects(failed.enqueue(first));
});

test("ошибка сохранения после подтверждения сервера вызывает повтор с тем же идентификатором", async () => {
  const storage = memory();
  let failAck = false;
  const outbox = createPatientOutbox(
    {
      ...storage,
      async setItem(key, value) {
        if (failAck) {
          failAck = false;
          throw new Error("disk");
        }
        await storage.setItem(key, value);
      },
    },
    alice,
  );
  await outbox.enqueue(first);
  const ids: string[] = [];
  failAck = true;
  await assert.rejects(
    outbox.flush(async (command) => {
      ids.push(command.commandId);
    }),
  );
  await outbox.flush(async (command) => {
    ids.push(command.commandId);
  });
  assert.deepEqual(ids, ["id-1", "id-1"]);
  assert.deepEqual(await outbox.list(), []);
});
