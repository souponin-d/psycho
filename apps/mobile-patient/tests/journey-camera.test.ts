import { test } from "node:test";
import assert from "node:assert/strict";
import { journeyCameraOffset } from "../src/core/journeyCamera.ts";

test("текущий день находится в середине между верхней и нижней панелями", () => {
  const insets = { top: 220, bottom: 260 };
  const viewport = 900;
  const contentY = 1500;
  const scroll = journeyCameraOffset(contentY, viewport, insets);
  assert.equal(insets.top + contentY - scroll, 430);
});
test("камера не уходит в отрицательную прокрутку, сохраняет свободное место для спутника", () => {
  assert.equal(journeyCameraOffset(20, 900, { top: 200, bottom: 220 }), 0);
  assert.ok(
    Number.isFinite(journeyCameraOffset(1000, 400, { top: 220, bottom: 240 })),
  );
});
