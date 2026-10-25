import { test } from "node:test";
import assert from "node:assert/strict";
import { connectScenario, seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { createDefaultState, restoreState } from "../src/core/model.ts";

test("вход требует код; неверный ввод не меняет подготовленный профиль", () => {
  const state = { ...seedScenario("2026-10-24"), connected: false };
  const before = JSON.stringify(state);
  for (const code of ["", " ", "OTHER", "SYNCLI START"])
    assert.throws(() => connectScenario(code, state), /код/);
  assert.equal(JSON.stringify(state), before);
});

test("код нормализуется, повторный вход сохраняет цель, мир, историю и черновики", () => {
  const state = { ...seedScenario("2026-10-24"), connected: false };
  state.goal = "Возвращаться к любимым занятиям";
  const connected = connectScenario("  syncli-start  ", state);
  assert.equal(connected.connected, true);
  assert.equal(connected.goal, state.goal);
  assert.equal(connected.events, state.events);
  assert.equal(connected.world, state.world);
  assert.equal(connectScenario("SYNCLI-START", connected), connected);
  assert.equal(
    applyPatientCommand(
      connected,
      { type: "connect", code: "SYNCLI-START" },
      {
        utcMs: Date.parse("2026-10-24T12:00Z"),
        offsetMinutes: 180,
        zone: "Europe/Moscow",
      },
    ),
    connected,
  );
});

test("произвольное время напоминания сохраняется после перезапуска", () => {
  const restored = restoreState(
    JSON.stringify({ ...createDefaultState(), morning: "07:45" }),
  );
  assert.equal(restored.morning, "07:45");
  for (const invalid of ["25:00", "12:60", "9:00", "no"])
    assert.equal(
      restoreState(
        JSON.stringify({ ...createDefaultState(), morning: invalid }),
      ).morning,
      "09:00",
    );
});

test("время самоотчёта хранится отдельно от приёма препарата", () => {
  assert.equal(createDefaultState().reportTime, "20:00");
  const restored = restoreState(
    JSON.stringify({
      ...createDefaultState(),
      morning: "07:45",
      reportTime: "21:15",
    }),
  );
  assert.equal(restored.reportTime, "21:15");
  assert.equal(restored.morning, "07:45");
});
