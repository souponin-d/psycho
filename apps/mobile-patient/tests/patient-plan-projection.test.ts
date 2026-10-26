import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePatientPlan } from "../src/core/patientPlanProjection.ts";

const med = {
  id: "m1",
  kind: "medication",
  title: "Препарат A",
  dose: "10 мг",
  schedule: "Утром",
  startDate: "2026-10-26",
  endDate: "",
  status: "confirmed",
  patientInstructions: "По назначению врача",
};
test("все подтверждённые назначения читаются без выдумывания времени приёма", () => {
  const result = decodePatientPlan([
    med,
    { ...med, id: "m2", title: "Препарат B", schedule: "По необходимости" },
  ]);
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.deepEqual(
    result.items.map((item) => [item.id, item.title, item.schedule]),
    [
      ["m1", "Препарат A", "Утром"],
      ["m2", "Препарат B", "По необходимости"],
    ],
  );
  assert.ok(!("slots" in result.items[0]!));
});
test("неизвестная, неполная или отменённая запись не выдаётся за подтверждённое назначение", () => {
  for (const value of [
    null,
    [null],
    [{ ...med, status: "stopped" }],
    [{ ...med, id: "" }],
    [{ ...med, dose: null }],
    [{ ...med, kind: "unknown" }],
  ])
    assert.equal(decodePatientPlan(value).kind, "unavailable");
});
