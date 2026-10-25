import { test } from "node:test";
import assert from "node:assert/strict";
import { routeToObject } from "../src/core/companion.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { scenes } from "../src/config/worldCatalog.ts";
test("спутник не перекрывает подписи камней на узком экране", () => {
  for (const territory of ["shore", "garden"] as const) {
    const world = { ...seedScenario("2026-10-25").world, territory };
    for (const [x, y] of scenes[territory].stones) {
      const start = { x: Math.max(0.18, x - 0.15), y: y + 0.055 };
      const path = routeToObject(start, world, undefined, start);
      assert(path.length > 0);
      for (const p of path) {
        assert(
          scenes[territory].stones.every(
            ([sx, sy]) => Math.hypot(p.x - sx, (p.y - 0.03 - sy) * 3) > 0.31,
          ),
          "Тело перекрывает подпись дня",
        );
      }
    }
  }
});
