import { test } from "node:test";
import assert from "node:assert/strict";
import { wardrobeRect } from "../src/core/wardrobeLayout.ts";
test("одежда и аксессуары помещаются на всех исходных кадрах обоих спутников", () => {
  for (const mascot of ["cloud", "fluffy"] as const)
    for (const group of ["idle", "walk", "emotion"] as const)
      for (let index = 0; index < 4; index++)
        for (const item of [
          "scarf",
          "hoodie",
          "cape",
          "star",
          "bow",
          "leaf",
        ] as const) {
          const r = wardrobeRect(mascot, group, index, item);
          assert(r.x >= 12 && r.y >= 12);
          assert(r.x + r.width <= 500 && r.y + r.height <= 500);
          if (["scarf", "hoodie", "cape"].includes(item))
            assert(r.y >= 270, "Лицо должно оставаться открытым");
        }
});
test("посадка учитывает вид и позу, материал не привязан к одной общей геометрии", () => {
  assert.notDeepEqual(
    wardrobeRect("cloud", "idle", 0, "hoodie"),
    wardrobeRect("fluffy", "idle", 0, "hoodie"),
  );
  assert.notDeepEqual(
    wardrobeRect("cloud", "idle", 0, "hoodie"),
    wardrobeRect("cloud", "emotion", 3, "hoodie"),
  );
});
