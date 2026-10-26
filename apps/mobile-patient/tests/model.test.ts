import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultState,
  reduceState,
  restoreState,
} from "../src/core/model.ts";
import { demoReply } from "../src/core/chat.ts";
import { planOperation, historyDates } from "../src/core/model.ts";

test("выполненный самоотчёт можно снять с плана без создания нового отчёта", () => {
  assert.equal(planOperation("checkin", true), "undo");
  assert.equal(planOperation("checkin", false), "report");
});
test("история позволяет выбрать сохранённый день за пределами последней недели", () => {
  const state = {
    ...createDefaultState(),
    completed: { "2026-09-10": ["morning"] },
    reports: [
      {
        id: "old",
        day: "2026-08-02",
        time: "12:00",
        mood: "calm" as const,
        sleep: "Хорошо",
        note: "",
      },
    ],
  };
  assert.deepEqual(historyDates(state, ["2026-10-22"]), [
    "2026-08-02",
    "2026-09-10",
    "2026-10-22",
  ]);
});

test("повреждённое хранилище не ломает запуск и не оставляет неизвестную тему", () => {
  assert.equal(restoreState("{broken").theme, "light");
  assert.equal(
    restoreState('{"version":9,"theme":"unknown"}').onboarded,
    false,
  );
});
test("настройки и прохождение онбординга восстанавливаются после перезапуска", () => {
  const state = {
    ...createDefaultState(),
    theme: "dark",
    mascot: "cloud",
    name: "Ира",
    onboarded: true,
  };
  const restored = restoreState(JSON.stringify(state));
  assert.equal(restored.theme, "dark");
  assert.equal(restored.mascot, "cloud");
  assert.equal(restored.name, "Ира");
  assert.equal(restored.onboarded, true);
});
test("повторная отметка не дублирует задачу и не отмечает её в другом дне", () => {
  const action = {
    type: "complete",
    day: "2026-10-22",
    taskId: "morning",
    done: true,
  } as const;
  const once = reduceState(createDefaultState(), action);
  const twice = reduceState(once, action);
  assert.deepEqual(twice.completed["2026-10-22"], ["morning"]);
  assert.equal(twice.completed["2026-10-23"], undefined);
  assert.deepEqual(
    reduceState(twice, { ...action, done: false }).completed["2026-10-22"],
    [],
  );
});
test("подмена неизвестного задания не создаёт выполненную задачу", () => {
  const state = createDefaultState();
  assert.deepEqual(
    reduceState(state, {
      type: "complete",
      taskId: "unknown",
      day: "2026-10-22",
      done: true,
    }),
    state,
  );
});
test("повторная отправка одного самоотчёта даёт одну запись, смена темы её сохраняет", () => {
  const report = {
    id: "report-1",
    day: "2026-10-22",
    time: "12:30",
    mood: "calm",
    sleep: "Хорошо",
    note: "Демо",
  } as const;
  const once = reduceState(createDefaultState(), { type: "report", report });
  const twice = reduceState(once, { type: "report", report });
  const themed = reduceState(twice, {
    type: "preferences",
    patch: { theme: "lavender", mascot: "cloud" },
  });
  assert.equal(themed.reports.filter((r) => r.id === "report-1").length, 1);
  assert.equal(themed.reports.find((r) => r.id === "report-1")?.note, "Демо");
  assert.equal(themed.theme, "lavender");
});
test("невалидные записи при восстановлении отбрасываются, комментарий ограничен", () => {
  const restored = restoreState(
    JSON.stringify({
      ...createDefaultState(),
      reports: [
        {
          id: "bad",
          day: "no-date",
          time: "wrong",
          mood: "diagnosis",
          sleep: 5,
          note: "",
        },
        {
          id: "ok",
          day: "2026-10-22",
          time: "12:00",
          mood: "calm",
          sleep: "Хорошо",
          note: "x".repeat(800),
        },
      ],
    }),
  );
  assert.equal(restored.reports.length, 1);
  assert.equal(restored.reports[0]?.note.length, 500);
});
test("навигатор сохраняет вопрос без обещания доставки и медицинских назначений", () => {
  assert.match(demoReply("Расскажи о плане"), /план/i);
  assert.match(demoReply("Напиши врачу"), /Сохраните вопрос/i);
  assert.doesNotMatch(demoReply("Напиши врачу"), /отправлено|доставлено|демо/i);
  assert.match(demoReply("Сколько препарата принимать?"), /врач|назначени/i);
});
test("сброс удаляет локальные отметки и возвращает выбор оформления", () => {
  const changed = {
    ...createDefaultState(),
    onboarded: true,
    completed: { "2026-10-22": ["morning"] },
  };
  const reset = reduceState(changed, { type: "reset" });
  assert.equal(reset.onboarded, false);
  assert.deepEqual(reset.completed, {});
});
