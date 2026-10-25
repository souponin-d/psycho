import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayAt,
  shiftDay,
  closeElapsedDays,
  journeyProgress,
} from "../src/core/calendar.ts";
import { assessDay } from "../src/core/therapy.ts";
import { seedScenario } from "../src/core/scenario.ts";
import type { Instant, PatientEvent } from "../src/core/journeyModel.ts";

const clock = (iso: string, offsetMinutes = 180): Instant => ({
  utcMs: Date.parse(iso),
  zone: "Europe/Moscow",
  offsetMinutes,
});
const today = "2026-10-24";

test("локальная дата меняется строго в полночь, включая положительное смещение", () => {
  assert.equal(dayAt(clock("2026-10-23T20:59:59.999Z")), "2026-10-23");
  assert.equal(dayAt(clock("2026-10-23T21:00:00.000Z")), today);
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDay("2028-03-01", -1), "2028-02-29");
});

test("восемь синтетических прошлых дней стабильны, серия 1 и награда первой главы", () => {
  const state = seedScenario(today);
  assert.equal(state.plan.startedAt, "2026-10-16");
  assert.equal(Object.keys(state.closedDays).length, 8);
  assert.equal(state.closedDays["2026-10-18"].complete, false);
  assert.equal(state.closedDays["2026-10-22"].complete, false);
  assert.equal(state.closedDays["2026-10-23"].complete, true);
  assert.equal(state.closedDays[today], undefined);
  assert.equal(journeyProgress(state, today).streak, 1);
  assert.equal(state.rewards.filter((r) => r.id === "chapter-0").length, 1);
});

test("все приёмы и полный отчёт дают зачёт только без незавершённого назначенного теста", () => {
  const state = seedScenario(today);
  const sampleDay = "2026-10-23";
  assert.equal(assessDay(state.plan, state.events, sampleDay).complete, true);
  const assigned = {
    ...state.plan,
    tests: [
      ...state.plan.tests,
      {
        id: "test-yesterday",
        day: sampleDay,
        formId: "gad7" as const,
        questionCount: 7,
      },
    ],
  };
  const result = assessDay(assigned, state.events, sampleDay);
  assert.equal(result.complete, false);
  assert(result.missing.includes("test:test-yesterday"));
});

test("нет отметки и пропуск — разные причины, оба препятствуют зачёту", () => {
  const state = seedScenario(today);
  assert(
    assessDay(state.plan, state.events, "2026-10-18").missing.some((x) =>
      x.startsWith("dose:missed:"),
    ),
  );
  assert(
    assessDay(state.plan, state.events, today).missing.some((x) =>
      x.startsWith("dose:unknown:"),
    ),
  );
});

test("дополнительная личная запись без обязательных полей не заменяет самоотчёт", () => {
  const state = seedScenario(today);
  const events: PatientEvent[] = [
    ...state.events,
    {
      id: "personal",
      kind: "report",
      day: today,
      recordedDay: today,
      at: Date.parse(today + "T10:00:00Z"),
      fields: { feeling: { valence: 4, energy: 3 } },
      note: "Личный момент",
      required: false,
    },
  ];
  assert(assessDay(state.plan, events, today).missing.includes("report"));
});

test("незавершённый тест не считается нулевым или пройденным", () => {
  const state = seedScenario(today);
  const assignment = state.plan.tests[0];
  const events: PatientEvent[] = state.events.filter(
    (e) => e.kind !== "questionnaire",
  );
  events.push({
    id: "partial",
    kind: "questionnaire",
    day: assignment.day,
    recordedDay: assignment.day,
    at: Date.parse(assignment.day + "T12:00:00Z"),
    assignmentId: assignment.id,
    formId: "gad7",
    answers: [0, 0],
  });
  assert(
    assessDay(state.plan, events, assignment.day).missing.includes(
      "test:" + assignment.id,
    ),
  );
});

test("сохранение ровно в полночь не восстанавливает вчерашний день", () => {
  const state = seedScenario(today);
  const missingDay = "2026-10-22";
  const later: PatientEvent = {
    id: "late-report",
    kind: "report",
    day: missingDay,
    recordedDay: "2026-10-23",
    at: Date.parse("2026-10-22T21:00:00Z"),
    required: true,
    fields: {
      feeling: { valence: 3, energy: 2 },
      sleep: "Обычно",
      anxiety: 3,
      functioning: 4,
      tolerability: "Без трудностей",
    },
    note: "Исправление",
  };
  assert.equal(
    assessDay(state.plan, [...state.events, later], missingDay).complete,
    false,
  );
  const result = closeElapsedDays(
    { ...state, events: [...state.events, later] },
    clock("2026-10-24T10:00:00Z"),
  );
  assert.deepEqual(result.closedDays[missingDay], state.closedDays[missingDay]);
});

test("возврат после трёх дней закрывает календарные пропуски без фонового JS", () => {
  const state = seedScenario(today);
  const next = closeElapsedDays(state, clock("2026-10-27T09:00:00Z"));
  for (const day of [today, "2026-10-25", "2026-10-26"])
    assert.equal(next.closedDays[day].complete, false);
  assert.equal(journeyProgress(next, "2026-10-27").streak, 0);
  assert.equal(next.rewards.filter((r) => r.id === "chapter-0").length, 1);
  assert.deepEqual(closeElapsedDays(next, clock("2026-10-27T10:00:00Z")), next);
});

test("откат даты не открывает уже закрытые дни и не повторяет награду", () => {
  const state = seedScenario(today);
  const back = closeElapsedDays(state, clock("2026-10-22T10:00:00Z", -300));
  assert.deepEqual(back.closedDays, state.closedDays);
  assert.deepEqual(back.rewards, state.rewards);
  assert.equal(back.lastObservedDay, today);
});
