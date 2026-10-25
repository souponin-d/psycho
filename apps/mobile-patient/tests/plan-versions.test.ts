import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { planForDay, assessDay } from "../src/core/therapy.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
test("синтетическое уточнение плана действует с сегодняшней даты и не переписывает прошлые обязательства", () => {
  const s = seedScenario("2026-10-25");
  assert.equal(s.planVersions?.length, 2);
  const before = planForDay(s, "2026-10-24"),
    after = planForDay(s, "2026-10-25");
  assert.notEqual(before.id, after.id);
  assert.equal(before.reportFields.length, 3);
  assert.equal(after.reportFields.length, 5);
  const facts = s.events.filter(
    (e) => e.kind !== "report" || e.day !== "2026-10-24" || !e.required,
  );
  const original = s.events.find(
    (e) => e.kind === "report" && e.day === "2026-10-24",
  )!;
  if (original.kind !== "report") throw Error("fixture");
  const historical = {
    ...original,
    fields: {
      feeling: original.fields.feeling,
      sleep: original.fields.sleep,
      anxiety: original.fields.anxiety,
    },
  };
  assert(assessDay(before, [...facts, historical], "2026-10-24").complete);
  const now = {
    utcMs: Date.parse("2026-10-25T12:00:00Z"),
    offsetMinutes: 0,
    zone: "UTC",
  };
  const edited = applyPatientCommand(
    s,
    { type: "event", event: { ...historical, id: "old-edit" } },
    now,
  );
  assert.deepEqual(edited.closedDays, s.closedDays);
  assert.throws(() =>
    applyPatientCommand(
      s,
      {
        type: "event",
        event: { ...historical, id: "today-incomplete", day: "2026-10-25" },
      },
      now,
    ),
  );
});
