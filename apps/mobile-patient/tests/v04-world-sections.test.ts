import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import {
  upgradeWorldSections,
  openWorldSection,
  sectionBaseDay,
} from "../src/core/worldSections.ts";
import { createPatientRepository } from "../src/storage/database.ts";
const clock = {
  utcMs: Date.parse("2026-10-25T12:00:00Z"),
  offsetMinutes: 0,
  zone: "UTC",
};
test("миграция привязывает прежние предметы один раз к существующему блоку", () => {
  const s = seedScenario("2026-10-25"),
    up = upgradeWorldSections(s, "2026-10-25");
  assert.equal(
    up.world.anchorDay,
    sectionBaseDay(s.plan.startedAt, "2026-10-25"),
  );
  assert.deepEqual(up.world.placements, s.world.placements);
  assert.strictEqual(upgradeWorldSections(up, "2026-11-20"), up);
  assert.deepEqual(up.events, s.events);
  assert.deepEqual(up.rewards, s.rewards);
});
test("новый участок сохраняет прежнюю расстановку и общий гардероб; возвращение её восстанавливает", () => {
  const s = upgradeWorldSections(seedScenario("2026-10-25"), "2026-10-25"),
    old = s.world.anchorDay!;
  const opened = openWorldSection(s, "2026-11-05");
  assert.equal(opened.world.placements.length, 0);
  assert.deepEqual(opened.world.sections?.[0].placements, s.world.placements);
  assert.deepEqual(opened.world.outfits, s.world.outfits);
  const returned = openWorldSection(opened, old);
  assert.deepEqual(returned.world.placements, s.world.placements);
  assert.equal(
    new Set(returned.world.sections!.map((a) => a.anchorDay)).size,
    returned.world.sections!.length,
  );
  assert.deepEqual(returned.events, s.events);
});
test("repository сохраняет миграцию до выдачи состояния и после нового дня не переносит участок", async () => {
  let raw = JSON.stringify(seedScenario("2026-10-25"));
  const port = {
    read: async () => raw,
    write: async (v: string) => {
      raw = v;
    },
  };
  const repo = createPatientRepository(
    port,
    async () => null,
    () => clock,
  );
  const a = await repo.load();
  assert(a.world.anchorDay);
  const b = await repo.apply(
    { type: "tick" },
    { ...clock, utcMs: Date.parse("2026-11-10T12:00:00Z") },
  );
  assert.equal(b.world.anchorDay, a.world.anchorDay);
  assert.deepEqual(b.world.placements, a.world.placements);
  const fresh = createPatientRepository(
    port,
    async () => null,
    () => clock,
  );
  assert.equal((await fresh.load()).world.anchorDay, a.world.anchorDay);
});
test("ошибка записи миграции не стирает исходный профиль", async () => {
  const raw = JSON.stringify(seedScenario("2026-10-25"));
  const repo = createPatientRepository(
    {
      read: async () => raw,
      write: async () => {
        throw Error("disk");
      },
    },
    async () => null,
    () => clock,
  );
  await assert.rejects(repo.load(), /disk/);
  assert.equal(JSON.parse(raw).world.anchorDay, undefined);
});
