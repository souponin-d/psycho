// Run only on a synthetic Android profile. Optional private server config never enters logs.
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  nodes,
  find,
  fill,
  tap,
  open,
  pause,
  screen,
  shell,
} from "./android-harness.mjs";

const labels = () =>
  nodes()
    .map((n) => n.text || n["content-desc"])
    .filter(Boolean);
function waitFor(label) {
  for (let i = 0; i < 5; i++) {
    if (labels().includes(label)) return;
    pause(400);
  }
  throw Error("Не появился элемент: " + label);
}
const configIndex = process.argv.indexOf("--server-config");
if (configIndex !== -1) {
  const config = JSON.parse(
    fs.readFileSync(process.argv[configIndex + 1], "utf8"),
  );
  open("onboarding?access=1");
  fill("Код приглашения от врача", config.accessCode);
  tap("Подключить план");
  pause(2200);
}
open("");
waitFor("Мой путь");
assert.equal(shell("settings", "get", "system", "font_scale").trim(), "1.0");
screen("map-today");
tap("История");
waitFor("История");
assert.ok(find("Назад"));
assert.ok(!find("Врач"), "История открывается отдельно от навбара");
screen("history");
tap("Назад");
waitFor("Мой путь");
tap("Врач");
waitFor("Связь с врачом");
assert.ok(find("Связаться с врачом"));
assert.ok(
  !find("Напишите сообщение"),
  "Вкладка врача должна показывать список, не переписку",
);
screen("doctor-inbox");
tap("Связаться с врачом");
waitFor("Обращение");
screen("contact");
tap("Назад");
waitFor("Связь с врачом");
if (configIndex !== -1) {
  tap("Открыть чат с лечащим врачом");
  waitFor("Напишите сообщение");
  screen("doctor-chat");
  tap("Назад");
} else {
  assert.ok(find("Подключить чат с врачом по коду"));
}
tap("Лечение");
waitFor("Лечение");
assert.ok(!labels().some((label) => /^(Синкли|синкли|Мой план)$/.test(label)));
assert.ok(!find("Связаться с врачом"));
screen("treatment");
tap("Рядом");
waitFor("План, записи и вопросы");
assert.ok(!labels().some((label) => /^(Синкли|синкли)$/.test(label)));
screen("nearby");
tap("Настройки");
waitFor("Настройки");
tap("Тема Орбита");
open("");
waitFor("Мой путь");
tap("К сегодня");
pause(800);
screen("map-dark-today");
shell("input", "swipe", "540", "1300", "540", "850", "500");
pause(500);
screen("map-dark-scroll");
console.log(
  "PASS Android: map/history/back, doctor inbox/form/chat, treatment, nearby, settings, normal font and dark map scroll",
);
