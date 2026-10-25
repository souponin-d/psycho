import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feelingAt,
  pointFromPosition,
  validFeeling,
} from "../src/core/feelings.ts";
import { shoreProgress, decorations } from "../src/core/shore.ts";
import { createHapticGate } from "../src/core/hapticGate.ts";
import {
  createDefaultState,
  reduceState,
  restoreState,
} from "../src/core/model.ts";

test("сетка ограничивает жест краями, энергия растёт вверх, девять выражений различны", () => {
  assert.deepEqual(pointFromPosition(-50, 500, 300, 40), {
    valence: 0,
    energy: 0,
  });
  assert.deepEqual(pointFromPosition(260, 40, 300, 40), {
    valence: 6,
    energy: 6,
  });
  assert.equal(validFeeling({ valence: NaN, energy: 2 }), false);
  assert.equal(validFeeling({ valence: 6.5, energy: 2 }), false);
  assert.equal(validFeeling({ valence: 2, energy: 7 }), false);
  assert.equal(
    new Set(
      [0, 3, 6].flatMap((energy) =>
        [0, 3, 6].map((valence) => feelingAt({ valence, energy }).id),
      ),
    ).size,
    9,
  );
});

test("обновление 0.1 сохраняет настройки, старую историю и создаёт дни берега", () => {
  const old = {
    version: 1,
    onboarded: true,
    theme: "dark",
    mascot: "cloud",
    name: "Ира",
    morning: "08:00",
    motion: false,
    reports: [
      {
        id: "old",
        day: "2026-10-22",
        time: "12:30",
        mood: "low",
        sleep: "Обычно",
        note: "Заметка",
      },
    ],
    completed: { "2026-10-22": ["morning"] },
  };
  const restored = restoreState(JSON.stringify(old));
  assert.equal(restored.reports[0]?.note, "Заметка");
  assert.equal(restored.reports[0]?.feeling, undefined);
  assert.deepEqual(restored.memoryDays, ["2026-10-22"]);
  assert.equal(restored.haptics, true);
  assert.equal(restored.gameplay, true);
  assert.equal(restored.motion, false);
  assert.equal(restored.theme, "dark");
  assert.deepEqual(restored.completed["2026-10-22"], ["morning"]);
});

test("сохраняются координаты, своё название, сон и вибронастройка; повторный id не дублируется", () => {
  const report = {
    id: "one",
    day: "2026-10-24",
    time: "13:20",
    mood: "good" as const,
    feeling: { valence: 6, energy: 6 },
    label: "Моё воодушевление",
    sleep: "",
    note: "Солнечный день",
  };
  let state = reduceState(createDefaultState(), { type: "report", report });
  state = reduceState(state, { type: "report", report });
  state = reduceState(state, {
    type: "preferences",
    patch: { haptics: false, theme: "lavender" },
  });
  state = restoreState(JSON.stringify(state));
  assert.equal(state.reports.length, 1);
  assert.deepEqual(state.reports[0]?.feeling, { valence: 6, energy: 6 });
  assert.equal(state.reports[0]?.label, report.label);
  assert.equal(state.reports[0]?.sleep, "");
  assert.equal(state.haptics, false);
  assert.deepEqual(state.completed[report.day], ["checkin"]);
});

test("любое настроение оставляет один след за день; план и повторные записи не дают новые дни", () => {
  let state = createDefaultState();
  for (let i = 0; i < 4; i++)
    state = reduceState(state, {
      type: "report",
      report: {
        id: String(i),
        day: "2026-10-24",
        time: "14:00",
        mood: i % 2 ? "low" : "good",
        sleep: "",
        note: "",
      },
    });
  state = reduceState(state, {
    type: "complete",
    day: "2026-10-25",
    taskId: "morning",
    done: true,
  });
  assert.equal(state.reports.length, 4);
  assert.deepEqual(state.memoryDays, ["2026-10-24"]);
  assert.equal(shoreProgress(state.memoryDays, "2026-10-24").weekDays, 1);
  assert.deepEqual(decorations(state.memoryDays), ["leaf", "lantern"]);
});

test("цель считает различные дни текущей недели, предметы остаются после паузы и очистки старых отчётов", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-21"];
  assert.equal(shoreProgress(days, "2026-10-25").weekDays, 3);
  assert.equal(shoreProgress(days, "2026-10-26").weekDays, 0);
  const state = restoreState(
    JSON.stringify({
      ...createDefaultState(),
      memoryDays: days,
      decoration: "stone",
      reports: [],
    }),
  );
  assert.equal(state.decoration, "stone");
  assert.deepEqual(decorations(state.memoryDays), ["leaf", "lantern", "stone"]);
});

test("вопрос сохраняется и удаляется; пустые вопросы, невозможные даты и координаты отвергаются", () => {
  let state = reduceState(createDefaultState(), {
    type: "question:add",
    question: { id: "q1", text: "  Что обсудить?  ", day: "2026-10-24" },
  });
  assert.equal(
    restoreState(JSON.stringify(state)).questions[0]?.text,
    "Что обсудить?",
  );
  state = reduceState(state, {
    type: "question:add",
    question: { id: "q2", text: "  ", day: "2026-10-24" },
  });
  assert.equal(state.questions.length, 1);
  state = reduceState(state, { type: "question:remove", id: "q1" });
  assert.deepEqual(state.questions, []);
  const bad = restoreState(
    JSON.stringify({
      ...state,
      reports: [
        {
          id: "bad",
          day: "2026-02-30",
          time: "12:00",
          mood: "good",
          sleep: "",
          note: "",
        },
        {
          id: "bad2",
          day: "2026-10-24",
          time: "12:00",
          mood: "good",
          feeling: { valence: 99, energy: 2 },
          sleep: "",
          note: "",
        },
      ],
    }),
  );
  assert.deepEqual(bad.reports, []);
});

test("вибрация не повторяется в клетке, ограничена 80 мс и отключается настройкой", () => {
  const gate = createHapticGate();
  assert.equal(gate.step("1:1", 100, true), true);
  assert.equal(gate.step("1:1", 300, true), false);
  assert.equal(gate.step("1:2", 120, true), false);
  assert.equal(gate.step("1:3", 200, true), true);
  assert.equal(gate.step("2:3", 300, false), false);
  gate.reset();
  assert.equal(gate.step("1:3", 301, true), true);
});
