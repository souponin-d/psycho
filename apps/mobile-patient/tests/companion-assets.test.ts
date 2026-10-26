import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createArtworkSlots,
  createResourcePreparer,
} from "../src/core/companionPlayback.ts";

test("смена одежды обновляет только скрытый слот, готовое изображение остаётся прежним", () => {
  const original = { mascot: "cloud", clothing: "scarf" };
  const slots = createArtworkSlots("cloud:scarf", original);
  const changed = { mascot: "fluffy", clothing: "hoodie" };
  slots.stage(1, "fluffy:hoodie", changed);
  assert.equal(slots.identity(0), "cloud:scarf");
  assert.equal(slots.value(0), original);
  assert.equal(slots.identity(1), "fluffy:hoodie");
  assert.equal(slots.value(1), changed);
  // The next frame's resource snapshot must not leak into the still-visible slot.
  slots.stage(0, "fluffy:cape", { mascot: "fluffy", clothing: "cape" });
  assert.equal(slots.value(1), changed);
});
test("повторный переход заново подготавливает ранее готовый ресурс после возможного освобождения bitmap cache", async () => {
  let calls = 0;
  const prepare = createResourcePreparer(async (_source: number) => {
    calls++;
  });
  await prepare(7);
  await prepare(7);
  assert.equal(calls, 2);
});
test("только незавершённые загрузки объединяются; ошибка допускает новый запрос", async () => {
  let finish: () => void = () => {};
  let calls = 0;
  const prepare = createResourcePreparer((_source: number) => {
    calls++;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const first = prepare(1),
    second = prepare(1);
  assert.equal(calls, 1);
  finish();
  await Promise.all([first, second]);
  let failures = 0;
  const failing = createResourcePreparer(async () => {
    failures++;
    throw Error("load");
  });
  await assert.rejects(failing(1));
  await assert.rejects(failing(1));
  assert.equal(failures, 2);
});
