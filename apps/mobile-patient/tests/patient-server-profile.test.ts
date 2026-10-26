import { test } from "node:test";
import assert from "node:assert/strict";
import { createServerJourney } from "../src/core/serverJourney.ts";
import { createPatientRepository } from "../src/storage/database.ts";
import { patientProfileKey } from "../src/core/patientProfileKey.ts";
import { createScopedSnapshot } from "../src/storage/scopedSnapshot.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { assignedTasks } from "../src/core/questionnaires.ts";
import { notificationSchedule } from "../src/core/notifications.ts";
import { assessDay } from "../src/core/therapy.ts";
import { dayNode } from "../src/core/dayNode.ts";

test("до назначения врачом приложение не выдумывает задания и напоминания", () => {
  const state = createServerJourney("2026-10-26");
  assert.deepEqual(assignedTasks(state, "2026-10-26"), []);
  assert.equal(assessDay(state.plan, [], "2026-10-26").complete, false);
  assert.deepEqual(
    notificationSchedule(
      state.plan,
      { times: {}, reportTime: "20:00" },
      {
        utcMs: Date.parse("2026-10-26T10:00:00Z"),
        zone: "UTC",
        offsetMinutes: 0,
      },
    ),
    [],
  );
});

test("день без синхронизированного плана не объявляется пропуском", () => {
  const state = createServerJourney("2026-10-25");
  assert.equal(dayNode(state, "2026-10-25", "2026-10-26").status, "unknown");
});

test("при подготовке профиля можно сохранить игровой мир без переноса истории", () => {
  const demo = seedScenario("2026-10-26");
  const server = createServerJourney("2026-10-26", demo.world);
  assert.deepEqual(server.world, demo.world);
  assert.notEqual(server.world, demo.world);
  assert.deepEqual(server.events, []);
  assert.ok(demo.events.length > 0);
});

test("данные разных серверных профилей сохраняются в независимых снимках", async () => {
  const values = new Map<string, string>();
  const port = {
    read: async (key: string) => values.get(key) ?? null,
    write: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const first = createScopedSnapshot(port, "server-one");
  const second = createScopedSnapshot(port, "server-two");
  await first.write("one");
  await second.write("two");
  assert.equal(await first.read(), "one");
  assert.equal(await second.read(), "two");
});

test("серверные профили разных пациентов и аккаунтов не пересекаются с демо", () => {
  const a = {
    origin: "https://clinic.example",
    clinicId: "c1",
    patientId: "p1",
    actorId: "u1",
  };
  const keys = [
    patientProfileKey(null),
    patientProfileKey(a),
    patientProfileKey({ ...a, patientId: "p2" }),
    patientProfileKey({ ...a, actorId: "u2" }),
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.throws(() => patientProfileKey({ ...a, patientId: "" }));
});

test("новый серверный репозиторий не читает и не переносит демопрофиль", async () => {
  let raw: string | null = null;
  let legacyReads = 0;
  const now = {
    utcMs: Date.parse("2026-10-26T10:00:00Z"),
    zone: "UTC",
    offsetMinutes: 0,
  };
  const repository = createPatientRepository(
    {
      read: async () => raw,
      write: async (value) => {
        raw = value;
      },
    },
    async () => {
      legacyReads++;
      return "demo-secret";
    },
    () => now,
    (day) => createServerJourney(day),
  );
  const state = await repository.load();
  assert.equal(legacyReads, 0);
  assert.deepEqual(state.events, []);
  assert.ok(raw);
});

test("новый серверный профиль не содержит учебных назначений или истории", () => {
  const state = createServerJourney("2026-10-26");
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.drafts, {});
  assert.deepEqual(state.closedDays, {});
  assert.deepEqual(state.rewards, []);
  assert.deepEqual(state.plan.medication.slots, []);
  assert.equal(state.plan.medication.name, "");
  assert.deepEqual(state.plan.tests, []);
  assert.deepEqual(state.plan.reportFields, []);
  assert.equal(state.plan.doctor, "");
});

test("сброс серверного профиля не создаёт учебные назначения", async () => {
  const now = {
    utcMs: Date.parse("2026-10-26T10:00:00Z"),
    zone: "UTC",
    offsetMinutes: 0,
  };
  let raw: string | null = null;
  const repository = createPatientRepository(
    {
      read: async () => raw,
      write: async (value) => {
        raw = value;
      },
    },
    async () => null,
    () => now,
    (day) => createServerJourney(day),
  );
  const reset = await repository.apply({ type: "reset" });
  assert.equal(reset.scenarioId, "server-patient-v1");
  assert.deepEqual(reset.plan.medication.slots, []);
  assert.deepEqual(reset.events, []);
});
