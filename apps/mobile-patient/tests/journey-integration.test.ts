import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { achievementProgress } from "../src/core/achievements.ts";
import { validateWorld } from "../src/core/world.ts";
const now = {
  utcMs: Date.parse("2026-10-25T12:00:00Z"),
  offsetMinutes: 0,
  zone: "UTC",
};
test("первый мир имеет шесть интерактивных мест, но обустройство не засчитано за пациента", () => {
  const s = seedScenario("2026-10-25");
  assert.equal(s.world.placements.length, 6);
  assert.doesNotThrow(() => validateWorld(s, s.world));
  assert.equal(
    achievementProgress(s).find((a) => a.id === "my-place")?.unlocked,
    false,
  );
});
test("история и вопрос открывают отдельные награды только по реальным действиям, повтор не дублирует", () => {
  let s = seedScenario("2026-10-25");
  for (const activity of ["history", "question"] as const) {
    const before = s.rewards.length;
    s = applyPatientCommand(s, { type: "activity", activity }, now);
    assert.equal(s.rewards.length, before + 1);
    assert.deepEqual(
      applyPatientCommand(s, { type: "activity", activity }, now),
      s,
    );
  }
  assert(achievementProgress(s).find((a) => a.id === "my-history")?.unlocked);
  assert(achievementProgress(s).find((a) => a.id === "my-question")?.unlocked);
});
test("старый профиль без поля окружения сохраняется, новый вариант света и растений валидируется", () => {
  const s = seedScenario("2026-10-25");
  const world = {
    ...s.world,
    ambience: "dusk" as const,
    flora: "ferns" as const,
  };
  const next = applyPatientCommand(s, { type: "world", world }, now);
  assert.equal(next.world.ambience, "dusk");
  assert(next.rewards.some((r) => r.id === "achievement:my-place"));
  assert.throws(() => validateWorld(s, { ...world, ambience: "bad" as never }));
});
