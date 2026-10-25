import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  open,
  tap,
  tapNode,
  nodes,
  find,
  bounds,
  shell,
  screen,
  pause,
  screenSize,
  pkg,
  dir,
} from "./android-harness.mjs";

open("/");
pause(1200);
if (find("Путь")) tap("Путь");
tap("Вернуться к сегодняшнему дню");
const dated = () =>
  nodes()
    .filter((n) => n["content-desc"]?.includes("День пути"))
    .map((n) => ({ label: n["content-desc"], bounds: n.bounds }));
const initial = dated();
const [w, h] = screenSize();
const swipe = (x1, y1, x2, y2) => {
  shell(
    "input",
    "swipe",
    String(Math.round(x1)),
    String(Math.round(y1)),
    String(Math.round(x2)),
    String(Math.round(y2)),
    "900",
  );
  pause();
};
screen("20-map-before-swipe");
swipe(w * 0.52, h * 0.68, w * 0.52, h * 0.36);
assert.notDeepEqual(
  dated(),
  initial,
  "Вертикальный свайп изменил позиции календарных дат",
);
screen("21-map-after-swipe");
tap("Вернуться к сегодняшнему дню");
const returned = dated();
assert.deepEqual(returned, initial, "Возврат к текущей дате точный");
const today = nodes().find((n) =>
  n["content-desc"]?.includes("Сегодня. День пути"),
);
assert(today);
tapNode(today);
assert(nodes().some((n) => n.text?.includes("Самоотчёт")));
screen("22-date-details");
tap("Закрыть день");
const count = () =>
  Number(
    nodes()
      .find((n) => n.text?.includes("Обустроить мир · предметов:"))
      ?.text.split(":")
      .at(-1)
      .trim(),
  );
const beforeCount = count();
assert(Number.isFinite(beforeCount));
tap("Обустроить мой мир");
tap("Чайный столик. Поставить");
const label = "Чайный столик. Выбрано, перетащите для перемещения";
const before = bounds(find(label));
swipe(
  (before[0] + before[2]) / 2,
  (before[1] + before[3]) / 2,
  (before[0] + before[2]) / 2 + w * 0.06,
  (before[1] + before[3]) / 2 - h * 0.025,
);
const moved = bounds(find(label));
assert(moved[0] > before[0] + 15, "Перемещается предмет, а не карта");
screen("23-editor-drag");
tap("Готово");
assert.equal(count(), beforeCount + 1);
shell("am", "force-stop", pkg);
open("/");
pause(1500);
if (find("Путь")) tap("Путь");
assert.equal(
  count(),
  beforeCount + 1,
  "Предмет сохранён после остановки процесса",
);
tap("Обустроить мой мир");
tap("Закрыть мастерскую");
tap("Отмена");
tap("ОТМЕНИТЬ ИЗМЕНЕНИЯ");
assert.equal(count(), beforeCount + 1, "Отмена не меняет сохранённый мир");
screen("24-world-after-restart");
writeFileSync(
  join(dir, "world-result.json"),
  JSON.stringify(
    {
      verticalScroll: true,
      returnToToday: true,
      dayDetails: true,
      dragSelectedItem: true,
      saveAndRestart: true,
      cancelDraft: true,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "PASS: vertical calendar scroll, return, date tasks, world drag/save/restart/cancel",
);
