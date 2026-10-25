import { test } from "node:test";
import assert from "node:assert/strict";
import { describeHistoryEvent } from "../src/core/history.ts";
test("история ревизий описывает поля самоотчёта и точное время приёма", () => {
  const base = { id: "r", day: "2026-10-25", recordedDay: "2026-10-25", at: 0 };
  const a = describeHistoryEvent({
    ...base,
    kind: "report",
    required: true,
    note: "",
    fields: {
      feeling: { valence: 2, energy: 4 },
      sleep: "Хорошо",
      anxiety: 3,
      functioning: 2,
      tolerability: "Тошнота",
    },
  });
  for (const text of ["2/6", "4/6", "Хорошо", "3", "Тошнота"])
    assert(a.includes(text));
  const b = describeHistoryEvent({
    ...base,
    kind: "dose",
    slotId: "morning",
    status: "taken",
    occurredAt: "08:25",
  });
  assert(b.includes("08:25"));
});
