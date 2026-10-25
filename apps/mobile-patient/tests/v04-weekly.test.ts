import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterRewardItem } from "../src/core/weeklyReward.ts";
import { worldItems } from "../src/config/worldCatalog.ts";
import { grantRewards } from "../src/core/achievements.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { shiftDay } from "../src/core/calendar.ts";
test("каждая глава обещает реальный доступный предмет каталога", () => {
  assert.equal(chapterRewardItem(0), "garden");
  for (let i = 1; i < 100; i++)
    assert(worldItems.some((p) => p.id === chapterRewardItem(i)));
});
test("пять из семи выдают ровно показанную награду один раз", () => {
  const s = seedScenario("2026-10-25"),
    start = shiftDay(s.plan.startedAt, 7);
  const closedDays = { ...s.closedDays };
  for (let i = 0; i < 5; i++) {
    const day = shiftDay(start, i);
    closedDays[day] = { day, complete: true, missing: [], sealedAt: 1 };
  }
  const next = grantRewards({ ...s, closedDays });
  assert.equal(
    next.rewards.find((r) => r.id === "chapter-1")?.itemId,
    chapterRewardItem(1),
  );
  assert.deepEqual(grantRewards(next).rewards, next.rewards);
});
