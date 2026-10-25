import { test } from "node:test";
import assert from "node:assert/strict";
import {
  notificationSchedule,
  reconcileNotifications,
  handleNotificationAction,
  notificationContentData,
} from "../src/core/notifications.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { createPatientRepository } from "../src/storage/database.ts";
import { latestDose } from "../src/core/questionnaires.ts";
import type { Instant } from "../src/core/journeyModel.ts";
const now: Instant = {
  utcMs: Date.parse("2026-10-24T04:00Z"),
  zone: "Europe/Moscow",
  offsetMinutes: 180,
};
const state = seedScenario("2026-10-24");
const prefs = { times: { morning: "07:45" }, reportTime: "20:00" };

test("сырой Android headless payload dataString и обычный data дают одинаковые данные", () => {
  const payload = {
    syncliReminder: true,
    job: {
      id: "syncli.test",
      planId: state.plan.id,
      kind: "dose",
      day: "2026-10-24",
      at: now.utcMs,
      slotId: "morning",
    },
  };
  assert.deepEqual(
    notificationContentData({ dataString: JSON.stringify(payload) }),
    payload,
  );
  assert.deepEqual(notificationContentData({ data: payload }), payload);
  assert.equal(notificationContentData({ dataString: "invalid" }), undefined);
  assert.equal(notificationContentData({ dataString: "null" }), undefined);
});

test("расписание использует часы пациента, сохраняет схему и не создаёт прошлых сигналов", () => {
  const jobs = notificationSchedule(state.plan, prefs, now);
  const dose = jobs.find((j) => j.day === "2026-10-24" && j.kind === "dose")!;
  assert.equal(dose.at, Date.parse("2026-10-24T04:45Z"));
  assert.equal(dose.slotId, "morning");
  assert.equal(state.plan.medication.slots[0].time, "09:00");
  assert.ok(jobs.every((j) => j.at > now.utcMs));
  assert.equal(
    jobs.filter((j) => j.day === "2026-10-24" && j.kind === "test").length,
    1,
  );
  assert.equal(new Set(jobs.map((j) => j.id)).size, jobs.length);
});

test("смена времени или зоны заменяет прежний сигнал без дубликата", () => {
  const before = notificationSchedule(state.plan, prefs, now);
  const after = notificationSchedule(
    state.plan,
    { ...prefs, times: { morning: "08:30" } },
    now,
  );
  const delta = reconcileNotifications(after, before);
  assert.equal(delta.cancel.length, 28);
  assert.equal(delta.schedule.length, 28);
  assert.equal(reconcileNotifications(after, after).schedule.length, 0);
  const travelling = notificationSchedule(state.plan, prefs, {
    ...now,
    zone: "Asia/Yekaterinburg",
    offsetMinutes: 300,
  });
  assert.ok(reconcileNotifications(travelling, before).cancel.length > 0);
});

test("календарные напоминания учитывают смену летнего времени", () => {
  const plan = { ...state.plan, startedAt: "2026-03-28", tests: [] };
  const jobs = notificationSchedule(plan, prefs, {
    utcMs: Date.parse("2026-03-28T01:00Z"),
    zone: "Europe/Berlin",
    offsetMinutes: 60,
  });
  assert.equal(
    jobs.find((j) => j.day === "2026-03-28" && j.kind === "dose")!.at,
    Date.parse("2026-03-28T06:45Z"),
  );
  assert.equal(
    jobs.find((j) => j.day === "2026-03-29" && j.kind === "dose")!.at,
    Date.parse("2026-03-29T05:45Z"),
  );
});

test("действие Принял идемпотентно; вчерашний сигнал не восстанавливает стрик", async () => {
  let raw = JSON.stringify(state);
  const repo = createPatientRepository(
    {
      read: async () => raw,
      write: async (v) => {
        raw = v;
      },
    },
    async () => null,
    () => now,
  );
  const job = notificationSchedule(state.plan, prefs, now).find(
    (j) => j.kind === "dose",
  )!;
  assert.equal(
    (await handleNotificationAction({ action: "taken", job }, repo, now)).kind,
    "saved",
  );
  await handleNotificationAction({ action: "taken", job }, repo, now);
  assert.equal(
    (await repo.load()).events.filter((e) => e.id === "notification:" + job.id)
      .length,
    1,
  );
  assert.equal(
    latestDose(await repo.load(), job.day, "morning")?.status,
    "taken",
  );
  const tomorrow = { ...now, utcMs: now.utcMs + 86400000 };
  assert.equal(
    (await handleNotificationAction({ action: "taken", job }, repo, tomorrow))
      .kind,
    "expired",
  );
});

test("несуществующее время при переводе часов переносится вперёд, не раньше выбранного часа", () => {
  const plan = { ...state.plan, startedAt: "2026-03-28", tests: [] };
  const jobs = notificationSchedule(
    plan,
    { ...prefs, times: { morning: "02:30" } },
    {
      utcMs: Date.parse("2026-03-28T00:00Z"),
      zone: "Europe/Berlin",
      offsetMinutes: 60,
    },
  );
  assert.equal(
    jobs.find((j) => j.day === "2026-03-29" && j.kind === "dose")!.at,
    Date.parse("2026-03-29T01:30Z"),
  );
});

test("перенос на 15 минут не меняет назначение и не пересекает полночь", async () => {
  let raw = JSON.stringify(state);
  const repo = createPatientRepository(
    {
      read: async () => raw,
      write: async (v) => {
        raw = v;
      },
    },
    async () => null,
    () => now,
  );
  const job = notificationSchedule(state.plan, prefs, now).find(
    (j) => j.kind === "dose",
  )!;
  const delayed = await handleNotificationAction(
    { action: "snooze", job },
    repo,
    now,
  );
  assert.equal(delayed.kind, "snooze");
  if (delayed.kind === "snooze")
    assert.equal(delayed.job.at, now.utcMs + 15 * 60000);
  assert.deepEqual((await repo.load()).plan, state.plan);
  assert.equal(
    (
      await handleNotificationAction({ action: "snooze", job }, repo, {
        ...now,
        utcMs: Date.parse("2026-10-24T20:55Z"),
      })
    ).kind,
    "expired",
  );
});

test("уведомление другой версии назначения не отмечает приём", async () => {
  let raw = JSON.stringify(state);
  const repo = createPatientRepository(
    {
      read: async () => raw,
      write: async (v) => {
        raw = v;
      },
    },
    async () => null,
    () => now,
  );
  const job = {
    ...notificationSchedule(state.plan, prefs, now).find(
      (j) => j.kind === "dose",
    )!,
    planId: "old-plan",
  };
  assert.equal(
    (await handleNotificationAction({ action: "taken", job }, repo, now)).kind,
    "expired",
  );
  assert.deepEqual((await repo.load()).events, state.events);
});
