import { test } from "node:test";
import assert from "node:assert/strict";
import { createPatientRepository } from "../src/storage/database.ts";
import { seedScenario } from "../src/core/scenario.ts";
test("одинаковый черновик не вызывает повторных записей SQLite", async () => {
  let raw = JSON.stringify(seedScenario("2026-10-25")),
    writes = 0;
  const repo = createPatientRepository(
    {
      read: async () => raw,
      write: async (p) => {
        raw = p;
        writes++;
      },
    },
    async () => null,
    () => ({
      utcMs: Date.parse("2026-10-25T12:00Z"),
      zone: "UTC",
      offsetMinutes: 0,
    }),
  );
  await repo.load();
  const command = {
    type: "draft" as const,
    draft: {
      id: "report:2026-10-25",
      kind: "report" as const,
      day: "2026-10-25",
      fields: { feeling: { valence: 3, energy: 2 } },
      note: "",
      step: 0,
    },
  };
  await repo.apply(command);
  const after = writes;
  for (let i = 0; i < 10; i++) await repo.apply(structuredClone(command));
  assert.equal(writes, after);
});
