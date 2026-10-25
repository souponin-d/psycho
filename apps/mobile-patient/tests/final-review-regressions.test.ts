import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { journeyProgress } from "../src/core/calendar.ts";
import * as history from "../src/core/history.ts";
import { createPatientRepository } from "../src/storage/database.ts";
import { handleNotificationAction } from "../src/core/notifications.ts";
const { projectHistory, exportPatientHistory, historyHtml } = history;
const clock = (day: string) => ({
  utcMs: Date.parse(day + "T12:00:00Z"),
  offsetMinutes: 0,
  zone: "UTC",
});
test("основное и отложенное уведомления одновременно сохраняют ровно один факт приёма", async () => {
  const now = clock("2026-10-24");
  let raw = JSON.stringify(seedScenario("2026-10-24"));
  const repo = createPatientRepository(
    {
      read: async () => raw,
      write: async (value) => {
        raw = value;
      },
    },
    async () => null,
    () => now,
  );
  const state = await repo.load();
  const job = {
    id: "original",
    planId: state.plan.id,
    day: "2026-10-24",
    at: now.utcMs,
    kind: "dose" as const,
    slotId: "morning",
  };
  await Promise.all([
    handleNotificationAction({ action: "taken", job }, repo, now),
    handleNotificationAction(
      { action: "taken", job: { ...job, id: "snooze" } },
      repo,
      now,
    ),
  ]);
  const after = await repo.load();
  assert.equal(
    after.events.filter(
      (e) => e.kind === "dose" && e.day === job.day && e.slotId === job.slotId,
    ).length,
    1,
  );
});
test("откат часов не разрешает завершить тест закрытого дня или заработать клиническое достижение исправлением", () => {
  const s = seedScenario("2026-10-24");
  const next = applyPatientCommand(s, { type: "tick" }, clock("2026-10-25"));
  const old = next.closedDays["2026-10-24"];
  assert.equal(old.complete, false);
  const assignment = next.plan.tests.find((t) => t.day === "2026-10-24")!;
  assert.throws(() =>
    applyPatientCommand(
      next,
      {
        type: "event",
        event: {
          id: "rollback-test",
          kind: "questionnaire",
          day: assignment.day,
          assignmentId: assignment.id,
          formId: assignment.formId,
          answers: Array(9).fill(1),
          impact: 1,
        },
      },
      clock("2026-10-24"),
    ),
  );
  const report = s.events.find((e) => e.kind === "report")!;
  if (report.kind !== "report") throw Error("fixture");
  const fixed = applyPatientCommand(
    next,
    {
      type: "event",
      event: {
        ...report,
        id: "rollback-report",
        entityId: "report:2026-10-24",
        day: "2026-10-24",
      },
    },
    clock("2026-10-24"),
  );
  assert.deepEqual(fixed.rewards, next.rewards);
  assert.deepEqual(fixed.closedDays["2026-10-24"], old);
  assert.equal(fixed.events.at(-1)?.gameEligible, false);
  assert(
    projectHistory(fixed, {
      from: "2026-10-24",
      to: "2026-10-24",
    }).days[0].changes.some((c) => c.late),
  );
  const sparse = {
    ...s,
    closedDays: {},
    rewards: [],
    events: s.events.filter(
      (e) =>
        e.kind !== "report" || ["2026-10-16", "2026-10-17"].includes(e.day),
    ),
  };
  const sealed = applyPatientCommand(
    sparse,
    { type: "tick" },
    clock("2026-10-25"),
  );
  const retro = applyPatientCommand(
    sealed,
    {
      type: "event",
      event: {
        ...report,
        id: "third-retro",
        day: "2026-10-24",
        entityId: "report:2026-10-24",
      },
    },
    clock("2026-10-24"),
  );
  assert(!retro.rewards.some((r) => r.id === "achievement:three-reports"));
});
test("явный сегодняшний пропуск обнуляет отображаемую серию; отсутствие отметки не обнуляет, исправление до полуночи допустимо", () => {
  const s = seedScenario("2026-10-24"),
    now = clock("2026-10-24");
  assert.equal(journeyProgress(s, "2026-10-24").streak, 1);
  const missed = applyPatientCommand(
    s,
    {
      type: "event",
      event: {
        id: "missed",
        kind: "dose",
        day: "2026-10-24",
        slotId: "morning",
        status: "missed",
      },
    },
    now,
  );
  assert.equal(journeyProgress(missed, "2026-10-24").streak, 0);
  const corrected = applyPatientCommand(
    missed,
    {
      type: "event",
      event: {
        id: "fixed",
        kind: "dose",
        day: "2026-10-24",
        slotId: "morning",
        status: "taken",
      },
    },
    { ...now, utcMs: now.utcMs + 1 },
  );
  assert.equal(journeyProgress(corrected, "2026-10-24").streak, 1);
  assert.deepEqual(corrected.closedDays, s.closedDays);
});
test("отказ от игры скрывает игровые оценки и пояснения, сохраняя факты истории и выгрузки", () => {
  const s = seedScenario("2026-10-24");
  const p = projectHistory(
    s,
    { from: s.plan.startedAt, to: s.seedDay },
    { gameplay: false },
  );
  const missed = p.days.find((d) => d.day === "2026-10-18")!;
  const data = exportPatientHistory(p);
  assert(data.days.some((d) => d.doses.some((e) => e.status === "missed")));
  const json = JSON.stringify(data);
  assert(!json.includes('"gameOutcome"'));
  assert(!json.includes('"completedGameDays"'));
  assert(!historyHtml(p).includes("Закрытые игровые итоги"));
  const display = history.historyDayPresentation(missed, false);
  assert(
    !/стрик|серия|награ|игров|не зачт|мир/i.test(
      Object.values(display).join(" "),
    ),
  );
});
