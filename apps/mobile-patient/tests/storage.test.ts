import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../src/core/storage.ts";
import { createDefaultState } from "../src/core/model.ts";

test("неудачное чтение запрещает запись defaults поверх сохранённых данных", async () => {
  let writes = 0;
  const store = createStorage({
    async getItem() {
      throw new Error("disk unavailable");
    },
    async setItem() {
      writes++;
    },
  });
  await assert.rejects(store.read());
  await assert.rejects(store.write(createDefaultState()));
  assert.equal(writes, 0);
});
test("после повторного успешного чтения настройки восстанавливаются и запись разрешена", async () => {
  let failed = true;
  const values: string[] = [];
  const store = createStorage({
    async getItem() {
      if (failed) throw new Error("busy");
      return JSON.stringify({ ...createDefaultState(), theme: "dark" });
    },
    async setItem(_key, value) {
      values.push(value);
    },
  });
  await assert.rejects(store.read());
  failed = false;
  const state = await store.read();
  assert.equal(state.theme, "dark");
  await store.write({ ...state, mascot: "cloud" });
  assert.equal(JSON.parse(values[0]!).mascot, "cloud");
});
test("быстрые изменения сохраняются последовательно, более старое не перезаписывает новое", async () => {
  const values: string[] = [];
  let release: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store = createStorage({
    async getItem() {
      return null;
    },
    async setItem(_key, value) {
      if (values.length === 0) {
        values.push(value);
        await firstWrite;
      } else values.push(value);
    },
  });
  await store.read();
  const a = store.write({ ...createDefaultState(), name: "Первая" });
  const b = store.write({ ...createDefaultState(), name: "Вторая" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(values.length, 1);
  release!();
  await Promise.all([a, b]);
  assert.equal(JSON.parse(values[1]!).name, "Вторая");
});
