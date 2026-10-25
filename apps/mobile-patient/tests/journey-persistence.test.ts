import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateLegacy } from "../src/storage/migrateV1.ts";
import { createPatientRepository } from "../src/storage/database.ts";
import {
  createDefaultState,
  restoreState,
  reduceState,
} from "../src/core/model.ts";
import { createStorage } from "../src/core/storage.ts";
import type { Instant, PatientCommand } from "../src/core/journeyModel.ts";

const now: Instant = {
  utcMs: Date.parse("2026-10-24T09:00:00Z"),
  offsetMinutes: 180,
  zone: "Europe/Moscow",
};
const reports = Array.from({ length: 500 }, (_, i) => ({
  id: "old-" + i,
  day: "2026-10-20",
  time: "10:00",
  mood: "calm" as const,
  sleep: "Хорошо",
  note: "Запись " + i,
}));

test("архив мигрирует все 500 старых записей без выдуманных координат", () => {
  const raw = JSON.stringify({ ...createDefaultState(), reports });
  const migrated = migrateLegacy(raw, "2026-10-24");
  assert.equal(migrated.legacyArchive.length, 500);
  assert.equal(migrated.legacyArchive[0].feeling, undefined);
  assert.equal(migrated.connected, false);
});

test("старый адаптер тоже больше не обрезает архив при восстановлении и добавлении", () => {
  const state = restoreState(
    JSON.stringify({ ...createDefaultState(), reports }),
  );
  assert.equal(state.reports.length, 500);
  const next = reduceState(state, {
    type: "report",
    report: { ...reports[0], id: "new", day: "2026-10-24" },
  });
  assert.equal(next.reports.length, 501);
});

test("повреждённый legacy JSON не принимается за пустой профиль", () => {
  assert.throws(() => migrateLegacy("{broken", "2026-10-24"));
});

test("повреждённый JSON блокирует запись defaults в старом адаптере", async () => {
  let writes = 0;
  const storage = createStorage({
    async getItem() {
      return "{broken";
    },
    async setItem() {
      writes++;
    },
  });
  await assert.rejects(storage.read());
  await assert.rejects(storage.write(createDefaultState()));
  assert.equal(writes, 0);
});

function sqlitePort() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE patient_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
  );
  let fail = false;
  return {
    db,
    setFail(value: boolean) {
      fail = value;
    },
    async read() {
      return (
        (
          db.prepare("SELECT payload FROM patient_state WHERE id=1").get() as
            { payload: string } | undefined
        )?.payload ?? null
      );
    },
    async write(payload: string) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT OR REPLACE INTO patient_state(id,payload) VALUES (1,?)",
        ).run(payload);
        if (fail) throw new Error("disk full");
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

test("миграция выполняется один раз, повторный запуск читает сохранённый профиль и черновик", async () => {
  const port = sqlitePort();
  let legacyReads = 0;
  const legacy = async () => {
    legacyReads++;
    return JSON.stringify({ ...createDefaultState(), reports });
  };
  const repo = createPatientRepository(port, legacy, () => now);
  await repo.load();
  await repo.apply({
    type: "draft",
    draft: {
      id: "report:2026-10-24",
      kind: "report",
      day: "2026-10-24",
      note: "Незаконченная запись",
    },
  });
  const restarted = await createPatientRepository(
    port,
    legacy,
    () => now,
  ).load();
  assert.equal(legacyReads, 1);
  assert.equal(restarted.legacyArchive.length, 500);
  assert.equal(
    restarted.drafts["report:2026-10-24"].note,
    "Незаконченная запись",
  );
  port.db.close();
});

test("авария транзакции не подтверждает новую отметку и не теряет предыдущие данные", async () => {
  const port = sqlitePort();
  const repo = createPatientRepository(
    port,
    async () => null,
    () => now,
  );
  await repo.load();
  const before = await port.read();
  const command: PatientCommand = {
    type: "event",
    event: {
      id: "tap-1",
      kind: "dose",
      day: "2026-10-24",
      slotId: "morning",
      status: "taken",
    },
  };
  port.setFail(true);
  await assert.rejects(repo.apply(command), /disk full/);
  assert.equal(await port.read(), before);
  port.setFail(false);
  const saved = await repo.apply(command);
  assert.equal(saved.events.filter((e) => e.id === "tap-1").length, 1);
  const duplicate = await repo.apply(command);
  assert.equal(duplicate.events.filter((e) => e.id === "tap-1").length, 1);
  port.db.close();
});

test("быстрые команды сохраняются в порядке очереди без потери последней записи", async () => {
  const port = sqlitePort();
  const repo = createPatientRepository(
    port,
    async () => null,
    () => now,
  );
  await repo.load();
  await Promise.all([
    repo.apply({ type: "goal", goal: "Первый вариант" }),
    repo.apply({ type: "goal", goal: "Моя цель" }),
  ]);
  const restored = await createPatientRepository(
    port,
    async () => {
      throw Error("must not read legacy");
    },
    () => now,
  ).load();
  assert.equal(restored.goal, "Моя цель");
  port.db.close();
});
