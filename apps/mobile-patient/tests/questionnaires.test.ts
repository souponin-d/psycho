import { test } from "node:test";
import assert from "node:assert/strict";
import { questionnaires } from "../src/config/questionnaires.ts";
import {
  completeQuestionnaire,
  assignedTasks,
  publicHistory,
} from "../src/core/questionnaires.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { PatientValidationError } from "../src/core/patientErrors.ts";
const now = {
  utcMs: Date.parse("2026-10-24T10:00:00Z"),
  offsetMinutes: 180,
  zone: "Europe/Moscow",
};

test("ошибка пользовательского ввода отделена от ошибки хранилища для исправления без блокировки", () => {
  assert.throws(
    () =>
      applyPatientCommand(
        seedScenario("2026-10-24"),
        { type: "connect", code: "wrong" },
        now,
      ),
    PatientValidationError,
  );
});

test("полные русские формы имеют 7/9 симптомных вопросов и собственный паспорт", () => {
  assert.equal(questionnaires.gad7.questions.length, 7);
  assert.equal(questionnaires.phq9.questions.length, 9);
  for (const form of Object.values(questionnaires)) {
    assert.equal(form.language, "ru-RU");
    assert(form.version);
    assert(form.source.startsWith("https://"));
    assert.equal(form.options.length, 4);
    assert.equal(form.clinicalActivation, false);
  }
  assert(questionnaires.phq9.impactQuestion);
});

test("частичная форма и отсутствие дополнительного ответа не считаются прохождением", () => {
  const assignment = seedScenario("2026-10-24").plan.tests.find(
    (t) => t.formId === "phq9",
  )!;
  assert.throws(() => completeQuestionnaire(assignment, [0, 0]));
  assert.throws(() =>
    completeQuestionnaire(assignment, [1, 0, 0, 0, 0, 0, 0, 0, 0]),
  );
  const complete = completeQuestionnaire(
    assignment,
    [1, 0, 0, 0, 0, 0, 0, 0, 0],
    1,
  );
  assert.equal(complete.answers.length, 9);
  assert.equal(complete.impact, 1);
  assert.equal("score" in complete, false);
});

test("пройденный назначенный слот нельзя повторить ради награды или создать произвольно", () => {
  const state = seedScenario("2026-10-24"),
    assignment = state.plan.tests.find((t) => t.formId === "phq9")!;
  const completion = completeQuestionnaire(
    assignment,
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  const command = {
    type: "event" as const,
    event: {
      id: "complete-1",
      kind: "questionnaire" as const,
      day: assignment.day,
      ...completion,
    },
  };
  const next = applyPatientCommand(state, command, now);
  const again = applyPatientCommand(
    next,
    { ...command, event: { ...command.event, id: "complete-2" } },
    now,
  );
  assert.equal(
    again.events.filter(
      (e) => e.kind === "questionnaire" && e.assignmentId === assignment.id,
    ).length,
    1,
  );
  assert.throws(() =>
    applyPatientCommand(
      state,
      { ...command, event: { ...command.event, assignmentId: "made-up" } },
      now,
    ),
  );
});

test("публичная история не содержит ответы, баллы или сравнение тестов", () => {
  const state = seedScenario("2026-10-24");
  const projection = publicHistory(state);
  const json = JSON.stringify(projection);
  assert.equal(json.includes('"answers"'), false);
  assert.equal(json.includes('"score"'), false);
  const testRecord = projection.find((item) => item.kind === "questionnaire")!;
  assert.equal(testRecord.status, "Завершён");
  assert.equal(
    assignedTasks(state, "2026-10-24").filter((t) => t.kind === "questionnaire")
      .length,
    1,
  );
});

test("обязательные поля отчёта определены планом, личный момент не завершает задание", () => {
  const state = seedScenario("2026-10-24");
  const event = {
    id: "r-1",
    kind: "report" as const,
    day: "2026-10-24",
    required: true,
    note: "",
    fields: { feeling: { valence: 3, energy: 3 } },
  };
  assert.throws(() =>
    applyPatientCommand(state, { type: "event", event }, now),
  );
  const personal = applyPatientCommand(
    state,
    { type: "event", event: { ...event, required: false } },
    now,
  );
  assert.equal(
    assignedTasks(personal, "2026-10-24").find((t) => t.kind === "report")
      ?.completed,
    false,
  );
});
