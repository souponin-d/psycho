import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayMarkerPresentation,
  journeyHud,
} from "../src/core/journeyPresentation.ts";
test("будущий камень не получает галочку, сегодня и пропуск различаются текстом", () => {
  assert.equal(dayMarkerPresentation("2026-10-26", "future", false).symbol, "");
  assert.equal(
    dayMarkerPresentation("2026-10-26", "future", false).status,
    "Впереди",
  );
  assert.equal(
    dayMarkerPresentation("2026-10-25", "today", false).status,
    "Сегодня",
  );
  assert.equal(
    dayMarkerPresentation("2026-10-24", "missed", false).status,
    "Пропуск",
  );
  assert.equal(
    dayMarkerPresentation("2026-10-24", "complete", false).symbol,
    "✓",
  );
});
test("завершённый сегодня обозначается предварительным выполнением, а не изменением даты", () => {
  const p = dayMarkerPresentation("2026-10-25", "today", true);
  assert.match(p.date, /25/);
  assert.equal(p.status, "Всё выполнено");
});
test("компактный HUD показывает остаток и точные даты семидневной главы", () => {
  const p = journeyHud(1, 3, 2, "2026-10-25");
  assert.equal(p.remaining, 2);
  assert.equal(p.taskLabel, "Осталось 2 дела");
  assert.match(p.weekLabel, /25/);
  assert.match(p.weekLabel, /31/);
  assert.match(p.weekLabel, /2 из 5/);
  assert.equal(
    journeyHud(3, 3, 3, "2026-10-25").taskLabel,
    "На сегодня всё выполнено",
  );
});
test("недоступный локальный план не объявляется полностью выполненным", () => {
  assert.equal(
    journeyHud(0, 0, 0, "2026-10-25", false).taskLabel,
    "Откройте план врача",
  );
});
