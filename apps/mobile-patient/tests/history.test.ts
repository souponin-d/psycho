import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectHistory,
  exportPatientHistory,
  historyHtml,
} from "../src/core/history.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { latestReports } from "../src/core/questionnaires.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { assessDay } from "../src/core/therapy.ts";
import type { Instant, ReportEvent } from "../src/core/journeyModel.ts";
const today = "2026-10-25";
const now: Instant = {
  utcMs: Date.parse(today + "T12:00Z"),
  offsetMinutes: 180,
  zone: "Europe/Moscow",
};
const range = { from: "2026-10-17", to: today };

test("нет записи — пробел на графике; назначенные дозы разделены на три категории", () => {
  const data = projectHistory(seedScenario(today), range);
  assert.equal(data.days.length, 9);
  assert.equal(data.days.at(-1)!.valence, null);
  assert.equal(data.days.at(-1)!.energy, null);
  assert.equal(data.summary.taken, 7);
  assert.equal(data.summary.missed, 1);
  assert.equal(data.summary.unknown, 1);
  assert.equal(data.summary.assigned, 9);
  assert.equal(data.summary.reportDays, 7);
  assert.equal(
    data.days.find((d) => d.doses[0]?.status === "missed")!.doses[0].occurredAt,
    "",
  );
});

test("удаление отчёта сегодня снимает предварительный зачёт, прошлые итоги и награды сохраняются", () => {
  let state = seedScenario(today);
  state.plan.tests = state.plan.tests.filter((t) => t.day !== today);
  const fields = latestReports(state)[0].fields;
  state = applyPatientCommand(
    state,
    {
      type: "event",
      event: {
        id: "dose-today",
        kind: "dose",
        day: today,
        slotId: "morning",
        status: "taken",
      },
    },
    now,
  );
  state = applyPatientCommand(
    state,
    {
      type: "event",
      event: {
        id: "report-today",
        entityId: "report:" + today,
        kind: "report",
        day: today,
        fields,
        note: "Запись",
        required: true,
      },
    },
    now,
  );
  assert.equal(assessDay(state.plan, state.events, today).complete, true);
  const before = structuredClone(state.closedDays),
    rewards = structuredClone(state.rewards);
  state = applyPatientCommand(
    state,
    {
      type: "event",
      event: {
        id: "delete-today",
        entityId: "report:" + today,
        kind: "report",
        day: today,
        fields: {},
        note: "",
        required: true,
        deleted: true,
      },
    },
    now,
  );
  assert.equal(assessDay(state.plan, state.events, today).complete, false);
  assert.deepEqual(state.closedDays, before);
  assert.deepEqual(state.rewards, rewards);
  assert.equal(projectHistory(state, range).days.at(-1)!.reports.length, 0);
});

test("исправление прошлого факта видно вместе с датой правки и прежним значением, стрик не восстанавливается", () => {
  let state = seedScenario(today);
  const sealed = structuredClone(state.closedDays);
  state = applyPatientCommand(
    state,
    {
      type: "event",
      event: {
        id: "correct-dose",
        kind: "dose",
        day: "2026-10-19",
        slotId: "morning",
        status: "taken",
        note: "Уточнила запись",
      },
    },
    now,
  );
  const day = projectHistory(state, range).days.find(
    (d) => d.day === "2026-10-19",
  )!;
  assert.equal(day.doses[0].status, "taken");
  assert.equal(day.gameOutcome, "missed");
  assert.equal(day.changes[0].author, "Пациент на устройстве");
  assert.equal(day.changes[0].previous, "Пропущен");
  assert.deepEqual(state.closedDays, sealed);
});

test("ответы и баллы любого опроса не попадают в графики, JSON или HTML", () => {
  const state = seedScenario(today);
  state.events.push({
    id: "hidden-test",
    day: today,
    at: now.utcMs,
    recordedDay: today,
    kind: "questionnaire",
    assignmentId: state.plan.tests.find((t) => t.day === today)!.id,
    formId: "phq9",
    answers: [3, 3, 3, 3, 3, 3, 3, 3, 3],
    impact: 3,
    formVersion: "private-version",
  });
  const data = projectHistory(state, range);
  const json = JSON.stringify(exportPatientHistory(data));
  assert.equal(data.days.at(-1)!.valence, null);
  for (const secret of ["answers", "impact", "private-version", "score"])
    assert.ok(!json.includes(secret));
  assert.equal(data.days.at(-1)!.tests[0].status, "Завершён");
});

test("все 500 старых записей доступны в выгрузке; HTML экранирует пользовательский текст", () => {
  const state = seedScenario(today);
  state.legacyArchive = Array.from({ length: 500 }, (_, i) => ({
    id: "old-" + i,
    day: today,
    time: "10:00",
    mood: "neutral",
    sleep: "Обычно",
    note: i === 499 ? '<script>alert("x")</script>' : "Запись " + i,
  }));
  const data = projectHistory(state, range);
  assert.equal(data.days.at(-1)!.legacy.length, 500);
  const json = JSON.stringify(exportPatientHistory(data));
  assert.ok(json.includes("old-0") && json.includes("old-499"));
  const html = historyHtml(data);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>alert"));
});

test("публичная проекция использует белый список полей отчёта", () => {
  const state = seedScenario(today);
  const report = state.events.find(
    (e): e is ReportEvent => e.kind === "report",
  )!;
  Object.assign(report.fields, { answers: [3, 3], score: 99 });
  const json = JSON.stringify(
    exportPatientHistory(projectHistory(state, range)),
  );
  assert.ok(!json.includes('"answers"') && !json.includes('"score"'));
});

test("сброс удаляет личный архив и меняет экземпляр плана, старое уведомление не подходит", () => {
  const state = seedScenario(today);
  state.legacyArchive.push({
    id: "personal",
    day: today,
    time: "12:00",
    mood: "calm",
    sleep: "Хорошо",
    note: "Личное",
  });
  const reset = applyPatientCommand(state, { type: "reset" }, now);
  assert.equal(reset.connected, false);
  assert.equal(reset.legacyArchive.length, 0);
  assert.notEqual(reset.plan.id, state.plan.id);
  assert.equal(JSON.stringify(reset).includes("Личное"), false);
  assert.equal(Object.keys(reset.closedDays).length, 8);
});

test("архивные реальные координаты видны на графике, словесное настроение не превращается в число", () => {
  const state = seedScenario(today);
  state.legacyArchive.push({
    id: "actual-point",
    day: today,
    time: "12:00",
    mood: "calm",
    sleep: "Хорошо",
    note: "",
    feeling: { valence: 2, energy: 4 },
  });
  assert.equal(projectHistory(state, range).days.at(-1)!.energy, 4);
  delete state.legacyArchive[0].feeling;
  assert.equal(projectHistory(state, range).days.at(-1)!.energy, null);
});

test("удаление архивного момента сегодня скрывает его и сохраняет прежнюю заметку в исправлениях", () => {
  let state = seedScenario(today);
  state.legacyArchive.push({
    id: "old-today",
    day: today,
    time: "10:00",
    mood: "calm",
    sleep: "Хорошо",
    note: "Моя заметка",
  });
  state = applyPatientCommand(
    state,
    {
      type: "event",
      event: {
        id: "delete-archive",
        entityId: "legacy:old-today",
        kind: "report",
        day: today,
        required: false,
        fields: {},
        note: "",
        deleted: true,
      },
    },
    now,
  );
  const day = projectHistory(state, range).days.at(-1)!;
  assert.equal(day.legacy.length, 0);
  assert.equal(day.changes[0].previous, "Моя заметка");
  assert.equal(day.changes[0].current, "Запись удалена");
});
