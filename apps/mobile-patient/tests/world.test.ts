import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import {
  validateWorld,
  validatePlacement,
  reachableWalkPoints,
} from "../src/core/world.ts";
import { worldItems, scenes } from "../src/config/worldCatalog.ts";

const now = {
  utcMs: Date.parse("2026-10-24T12:00:00Z"),
  offsetMinutes: 0,
  zone: "UTC",
};
test("двадцать предметов, две территории и исходный мир проходят проверку", () => {
  const state = seedScenario("2026-10-24");
  assert.equal(worldItems.length, 20);
  assert.equal(new Set(worldItems.map((i) => i.id)).size, 20);
  assert.equal(Object.keys(scenes).length, 2);
  assert.doesNotThrow(() => validateWorld(state, state.world));
});
test("предмет нельзя поставить за границу или поверх календарной площадки", () => {
  const item = worldItems.find((i) => i.id === "bench")!;
  const p = seedScenario("2026-10-24").world.placements[0];
  for (const patch of [
    { x: NaN },
    { y: -1 },
    { scale: 8 },
    { rotation: Infinity },
    { x: 0.17, rotation: 45, scale: 1.3 },
    { x: scenes.shore.stones[0][0], y: scenes.shore.stones[0][1] },
  ])
    assert.equal(
      validatePlacement(item, { ...p, ...patch }, scenes.shore).valid,
      false,
    );
});
test("закрытая награда, неизвестный предмет и повтор instanceId не сохраняются", () => {
  const s = seedScenario("2026-10-24");
  const p = s.world.placements[0];
  for (const placements of [
    [{ ...p, itemId: "unknown" }],
    [{ ...p, itemId: "star-mobile" }],
    [p, p],
  ])
    assert.throws(() =>
      applyPatientCommand(
        s,
        { type: "world", world: { ...s.world, placements } },
        now,
      ),
    );
});
test("гардеробы независимы; закрытый сад не сохраняется; прогулка не пересекает предметы", () => {
  const s = seedScenario("2026-10-24");
  const next = applyPatientCommand(
    s,
    {
      type: "world",
      world: {
        ...s.world,
        outfits: {
          ...s.world.outfits,
          fluffy: { color: "pearl", clothing: "cape", accessory: "star" },
        },
      },
    },
    now,
  );
  assert.deepEqual(next.world.outfits.cloud, s.world.outfits.cloud);
  assert.throws(() =>
    validateWorld({ ...s, rewards: [] }, { ...s.world, territory: "garden" }),
  );
  const points = reachableWalkPoints(s.world);
  assert(points.length >= 3);
  for (const p of points)
    assert(
      s.world.placements.every(
        (item) => Math.hypot(p.x - item.x, (p.y - item.y) * 3) > 0.14,
      ),
    );
});
