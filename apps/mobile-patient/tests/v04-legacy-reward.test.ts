import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { upgradeWorldSections } from "../src/core/worldSections.ts";
test("старый приз главы становится предметом без повторной выдачи и потери даты", () => {
  const s = seedScenario("2026-10-25");
  s.rewards.push({
    id: "chapter-1",
    itemId: "chapter-gift-1",
    day: "2026-10-23",
  });
  const a = upgradeWorldSections(s, "2026-10-25"),
    r = a.rewards.find((r) => r.id === "chapter-1")!;
  assert.equal(r.itemId, "flower-arch");
  assert.equal(r.day, "2026-10-23");
  assert.equal(a.rewards.length, s.rewards.length);
  assert.deepEqual(upgradeWorldSections(a, "2026-10-26"), a);
});
