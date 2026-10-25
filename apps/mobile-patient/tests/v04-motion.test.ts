import { test } from "node:test";
import assert from "node:assert/strict";
import { companionTimeline } from "../src/core/companionTimeline.ts";
import { companionModes } from "../src/core/companion.ts";
test("конечная реакция возвращается к спокойному кадру и не повторяется бесконечно", () => {
  for (const mode of companionModes.filter(
    (m) => m !== "idle" && m !== "walk",
  )) {
    const t = companionTimeline(mode);
    assert.equal(t.loop, false);
    assert.deepEqual(
      { group: t.steps.at(-1)!.group, index: t.steps.at(-1)!.index },
      { group: "idle", index: 0 },
    );
  }
});
test("переходы используют существующие кадры и успевают завершиться до следующей позы", () => {
  for (const mode of companionModes) {
    const t = companionTimeline(mode);
    assert(t.steps.length > 0);
    for (const s of t.steps) {
      assert(s.index >= 0 && s.index < 4);
      assert(s.holdMs >= 60);
      assert(s.blendMs > 0 && s.blendMs < s.holdMs);
    }
  }
});
test("спокойствие имеет длинную паузу, а закрытое моргание не зависает", () => {
  const t = companionTimeline("idle");
  assert.equal(t.loop, true);
  assert(
    t.steps
      .filter((s) => s.group === "idle" && s.index === 0)
      .reduce((n, s) => n + s.holdMs, 0) >= 4000,
  );
  assert(
    t.steps
      .filter((s) => s.group === "idle" && s.index === 2)
      .every((s) => s.holdMs <= 100),
  );
  assert.equal(companionTimeline("walk").loop, true);
});
