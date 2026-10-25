import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { dayNode } from "../src/core/dayNode.ts";
test("точка дня показывает обязательства, тест появляется только в назначенную дату", () => {
  const s = seedScenario("2026-10-25");
  const a = s.plan.tests[0];
  assert(
    dayNode(s, a.day, "2026-10-25").groups.some(
      (g) => g.kind === "questionnaire",
    ),
  );
  const future = dayNode(s, "2026-11-25", "2026-10-25");
  assert(!future.groups.some((g) => g.kind === "questionnaire"));
  assert.equal(future.done, 0);
  assert.equal(future.growth, 0);
  assert.equal(future.nextTask, null);
});
test("поздние исправления не выращивают пропущенный игровой день", () => {
  const s = seedScenario("2026-10-25"),
    day = s.plan.startedAt;
  const edited = {
    ...s,
    closedDays: {
      ...s.closedDays,
      [day]: { day, complete: false, missing: ["report"], sealedAt: 1 },
    },
  };
  const n = dayNode(edited, day, "2026-10-25");
  assert.equal(n.status, "missed");
  assert.equal(n.awarded, false);
  assert(n.growth < 3);
});
test("закрытая награда остаётся после исправления записи, сегодня получает точный следующий шаг", () => {
  const s = seedScenario("2026-10-25"),
    day = s.plan.startedAt;
  const n = dayNode(
    {
      ...s,
      events: [],
      closedDays: {
        ...s.closedDays,
        [day]: { day, complete: true, missing: [], sealedAt: 1 },
      },
    },
    day,
    "2026-10-25",
  );
  assert.equal(n.growth, 3);
  assert.equal(n.awarded, true);
  const today = dayNode({ ...s, events: [] }, "2026-10-25", "2026-10-25");
  assert(today.groups.some((g) => g.kind === "report"));
  assert.equal(today.nextTask?.kind, "dose");
});
