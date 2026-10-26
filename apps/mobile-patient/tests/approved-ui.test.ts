import { test } from "node:test";
import assert from "node:assert/strict";
import {
  patientLabel,
  dayRangeLabel,
  sleepLabel,
} from "../src/core/patientPresentation.ts";
import { createFrameGate, blendLayers } from "../src/core/companionPlayback.ts";

test("старые учебные подписи очищаются только в представлении; дозировка не придумывается", () => {
  assert.equal(
    patientLabel("Елена Андреевна · учебный врач"),
    "Елена Андреевна",
  );
  assert.equal(
    patientLabel("Учебная консультация · онлайн"),
    "Онлайн-консультация",
  );
  assert.equal(
    patientLabel("Дозировка задана в учебном плане"),
    "Дозировка не указана",
  );
  assert.equal(patientLabel(""), "Не указано");
  assert.equal(patientLabel("20 мг вечером"), "20 мг вечером");
});
test("русские диапазоны дат сохраняют месяц и год на границах", () => {
  assert.equal(dayRangeLabel("2026-10-23", "2026-10-29"), "23–29 октября");
  assert.equal(
    dayRangeLabel("2026-10-30", "2026-11-02"),
    "30 октября – 2 ноября",
  );
  assert.equal(
    dayRangeLabel("2026-12-30", "2027-01-02"),
    "30 декабря 2026 – 2 января 2027",
  );
  assert.equal(sleepLabel(null), "Нет записи");
  assert.equal(sleepLabel("Плохо"), "Плохо");
});
test("непрозрачная основа сохраняется на всём переходе; слой назначения всегда сверху", () => {
  for (const front of [0, 1] as const)
    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
      const layers = blendLayers(front, progress);
      assert.equal(layers[front].opacity, 1);
      assert.equal(layers[1 - front].opacity, progress);
      assert(layers[1 - front].zIndex > layers[front].zIndex);
    }
});
test("задержанный/ошибочный кадр и прерванная реакция не заменяют видимый готовый кадр", async () => {
  const gate = createFrameGate("idle");
  const old = gate.begin("walk"),
    latest = gate.begin("touch");
  assert.equal(gate.visible(), "idle");
  assert.equal(gate.commit(old), false);
  assert.equal(gate.visible(), "idle");
  gate.cancel();
  assert.equal(gate.commit(latest), false);
  const good = gate.begin("support");
  assert.equal(gate.commit(good), true);
  assert.equal(gate.visible(), "support");
});
