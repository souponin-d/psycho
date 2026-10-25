import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  nextCompanionState,
  companionModes,
  motionPose,
  routeToObject,
} from "../src/core/companion.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { scenes } from "../src/config/worldCatalog.ts";

test("двенадцать состояний; грусть краткая, пауза останавливает реакцию", () => {
  assert.equal(companionModes.length, 12);
  const sad = nextCompanionState({ mode: "idle", until: 0 }, "missed", 1000);
  assert.equal(sad.mode, "sad");
  assert(sad.until <= 2500);
  assert.equal(nextCompanionState(sad, "tick", 3000).mode, "idle");
  assert.equal(nextCompanionState(sad, "pause", 1100).mode, "idle");
  assert.equal(nextCompanionState(sad, "tap", 1100).mode, "touch");
});
test("прогулка к предмету строится по свободным узлам, без пересечения других предметов", () => {
  const world = seedScenario("2026-10-24").world;
  const route = routeToObject(
    { x: 0.5, y: 0.5 },
    world,
    world.placements[0].instanceId,
  );
  assert(route.length >= 2);
  for (const p of route)
    assert(
      scenes[world.territory].stones.every(
        ([x, y]) => Math.hypot(p.x - x, (p.y - y) * 3) > 0.105,
      ),
    );
  for (const p of route)
    assert(
      world.placements.every(
        (o) => Math.hypot(p.x - o.x, (p.y - o.y) * 3) > 0.12,
      ),
    );
});
test("все кадры и крайние фазы анимаций помещаются с запасом, включая одежду", () => {
  const frames = JSON.parse(
    readFileSync(
      new URL("../assets/companions/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(frames.length, 24);
  for (const f of frames) {
    assert(
      f.alphaBounds[0] >= 32 &&
        f.alphaBounds[1] >= 32 &&
        f.alphaBounds[2] <= 480 &&
        f.alphaBounds[3] <= 480,
    );
    for (const mode of companionModes)
      for (let i = 0; i <= 40; i++) {
        const pose = motionPose(mode, i / 40);
        // Union of material body and the widest clothing/accessory silhouettes.
        const b = [
          Math.min(f.bodyBounds[0], 110),
          Math.min(f.bodyBounds[1], 65),
          Math.max(f.bodyBounds[2], 402),
          Math.max(f.bodyBounds[3], 430),
        ];
        for (const x of [b[0], b[2]])
          for (const y of [b[1], b[3]]) {
            const r = (pose.rotation * Math.PI) / 180,
              dx = (x - 256) * pose.scale,
              dy = (y - 256) * pose.scale;
            const tx = 256 + dx * Math.cos(r) - dy * Math.sin(r) + pose.x * 512;
            const ty = 256 + dx * Math.sin(r) + dy * Math.cos(r) + pose.y * 512;
            assert(
              tx >= 8 && tx <= 504 && ty >= 8 && ty <= 504,
              `${f.file}/${mode}/${i}: ${tx},${ty}`,
            );
          }
      }
  }
});
