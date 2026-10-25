import { test } from "node:test";
import assert from "node:assert/strict";
import { garmentRig, warpGarmentPoint } from "../src/core/garmentRig.ts";
import { companionGeometry } from "../src/config/companionGeometry.ts";
test("зарегистрированная одежда следует форме каждого исходного кадра", () => {
  for (const id of ["cloud", "fluffy"] as const)
    for (const group of ["idle", "walk", "emotion"] as const)
      for (let frame = 0; frame < 4; frame++) {
        const rig = garmentRig(id, group, frame, "hoodie"),
          ref = companionGeometry[id + "-idle-0"],
          target = companionGeometry[id + "-" + group + "-" + frame];
        const p = warpGarmentPoint(rig, ref[0], ref[1]);
        assert(
          Math.abs(p.x - target[0]) < 0.01 && Math.abs(p.y - target[1]) < 0.01,
        );
        assert(rig.neckCenterY > rig.mouthY + 8);
        assert(rig.neckCenterY < target[3] - 50);
      }
});
test("накидка, худи и шарф имеют разные передние контуры, не общий прямоугольник", () => {
  const a = garmentRig("cloud", "idle", 0, "scarf"),
    b = garmentRig("cloud", "idle", 0, "hoodie"),
    c = garmentRig("cloud", "idle", 0, "cape");
  assert.notEqual(a.frontPath, b.frontPath);
  assert.notEqual(b.frontPath, c.frontPath);
  assert.notEqual(
    garmentRig("fluffy", "idle", 0, "hoodie").frontPath,
    b.frontPath,
  );
});
