import { test } from "node:test";
import assert from "node:assert/strict";
import { journeyMap } from "../src/core/journeyMap.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { shiftDay } from "../src/core/calendar.ts";

test("карта сохраняет календарные пропуски и показывает сегодня после восьми дней", () => {
  const state = seedScenario("2026-10-24");
  const map = journeyMap(state, "2026-10-24");
  assert.equal(map.days.length, 16);
  assert.equal(map.days[0].day, "2026-10-16");
  assert.equal(map.days[2].status, "missed");
  assert.equal(map.days[8].status, "today");
  assert.equal(map.days[9].status, "future");
  assert.equal(map.todayIndex, 8);
});

test("долгий путь содержит каждый день и не меняет сохранённый итог после правок", () => {
  const state = seedScenario("2026-10-24");
  state.closedDays["2026-10-18"].complete = false;
  const map = journeyMap(state, shiftDay("2026-10-24", 100));
  assert.equal(map.days.length, 116);
  assert.equal(new Set(map.days.map((d) => d.day)).size, 116);
  assert.equal(map.days[2].status, "missed");
  assert.equal(map.days[108].status, "today");
  assert.equal(map.days[9].status, "missed");
});
