import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { grantRewards, achievementProgress } from "../src/core/achievements.ts";
import { achievementCatalog } from "../src/config/worldCatalog.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";

test("двенадцать достижений с прямыми предметными наградами; первая глава независимо от стрика", () => {
  const s = seedScenario("2026-10-24");
  assert.equal(achievementCatalog.length, 12);
  assert.equal(new Set(achievementCatalog.map((a) => a.itemId)).size, 12);
  assert.equal(s.rewards.filter((r) => r.id === "chapter-0").length, 1);
  assert(achievementProgress(s).filter((a) => a.unlocked).length >= 6);
  assert.equal(grantRewards(s), s);
});
test("изменение эмоции/переносимости и обращение не меняют достижения", () => {
  const s = seedScenario("2026-10-24");
  const altered = {
    ...s,
    events: s.events
      .map((e) =>
        e.kind === "report"
          ? {
              ...e,
              fields: {
                ...e.fields,
                feeling: { valence: 0, energy: 0 },
                tolerability: "Есть трудности",
              },
            }
          : e,
      )
      .filter((e) => e.kind !== "contact"),
  };
  assert.deepEqual(
    achievementProgress(altered).map((a) => a.value),
    achievementProgress(s).map((a) => a.value),
  );
});
test("прошлые исправления не дают новые дни; награды не отнимаются после паузы", () => {
  const s = seedScenario("2026-10-24");
  const s2 = grantRewards({
    ...s,
    events: s.events.filter((e) => e.kind !== "report"),
    closedDays: {},
  });
  assert.deepEqual(s2.rewards, s.rewards);
  const report = s.events.find((e) => e.kind === "report")!;
  const progress = achievementProgress(s);
  const later = grantRewards({
    ...s,
    events: [
      ...s.events,
      { ...report, id: "retro", day: "2026-10-22", recordedDay: "2026-10-24" },
    ],
  });
  assert.deepEqual(
    achievementProgress(later).map((a) => a.value),
    progress.map((a) => a.value),
  );
});
test("первое обустройство сразу выдаёт награду, повтор команды не дублирует её", () => {
  const s = seedScenario("2026-10-24");
  const now = {
    utcMs: Date.parse("2026-10-24T12:00:00Z"),
    offsetMinutes: 0,
    zone: "UTC",
  };
  const world = {
    ...s.world,
    placements: [
      ...s.world.placements,
      {
        instanceId: "fourth",
        itemId: "cushion",
        x: 0.18,
        y: 0.43,
        rotation: 15,
        scale: 1,
      },
    ],
  };
  const next = applyPatientCommand(s, { type: "world", world }, now);
  assert.equal(
    next.rewards.filter((r) => r.id === "achievement:my-place").length,
    1,
  );
  assert.deepEqual(
    applyPatientCommand(next, { type: "world", world }, now).rewards,
    next.rewards,
  );
});
