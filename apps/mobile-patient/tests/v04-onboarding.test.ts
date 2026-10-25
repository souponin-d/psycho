import { test } from "node:test";
import assert from "node:assert/strict";
import { initialOnboarding, saveOnboarding } from "../src/core/onboarding.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { createPatientRepository } from "../src/storage/database.ts";
test("учебный приём, карта и предмет не меняют клинические записи и награды", () => {
  const s = seedScenario("2026-10-25"),
    p = {
      ...initialOnboarding(s.goal),
      step: 10,
      practiceDose: true,
      practiceFeeling: { valence: 1, energy: 5 },
      practiceItem: { x: 0.7, y: 0.3 },
    };
  const next = saveOnboarding(s, p);
  assert.deepEqual(next.events, s.events);
  assert.deepEqual(next.rewards, s.rewards);
  assert.deepEqual(next.world, s.world);
  assert.equal(next.onboarding?.practiceDose, true);
  assert.equal(next.goal, s.goal);
});
test("обязательное подключение нельзя обойти сохранением последнего шага", () => {
  const s = { ...seedScenario("2026-10-25"), connected: false },
    p = initialOnboarding(s.goal);
  assert.throws(() => saveOnboarding(s, { ...p, step: 12, completed: true }));
  assert.doesNotThrow(() => saveOnboarding(s, { ...p, step: 1, code: "SYN" }));
});
test("незавершённый маршрут и тренировка восстанавливаются после reload", async () => {
  let raw = JSON.stringify(seedScenario("2026-10-25"));
  const port = {
      read: async () => raw,
      write: async (v: string) => {
        raw = v;
      },
    },
    clock = () => ({
      utcMs: Date.parse("2026-10-25T12:00:00Z"),
      zone: "UTC",
      offsetMinutes: 0,
    });
  const repo = createPatientRepository(port, async () => null, clock),
    s = await repo.load();
  await repo.apply({
    type: "onboarding:save",
    progress: {
      ...initialOnboarding(s.goal),
      step: 7,
      name: "Ира",
      practiceFeeling: { valence: 2, energy: 4 },
    },
  });
  const again = await createPatientRepository(
    port,
    async () => null,
    clock,
  ).load();
  assert.equal(again.onboarding?.step, 7);
  assert.equal(again.onboarding?.name, "Ира");
  assert.deepEqual(again.onboarding?.practiceFeeling, {
    valence: 2,
    energy: 4,
  });
  assert.deepEqual(again.events, s.events);
});
test("полностью завершить обучение можно с корректным временем, без выполнения реальных заданий", () => {
  const s = seedScenario("2026-10-25"),
    p = { ...initialOnboarding(s.goal), step: 12, completed: true };
  const n = saveOnboarding(s, p);
  assert.equal(n.onboarding?.completed, true);
  assert.equal(n.shown?.["release:4"], true);
  assert.deepEqual(n.events, s.events);
  assert.throws(() => saveOnboarding(s, { ...p, morning: "25:80" }));
});
