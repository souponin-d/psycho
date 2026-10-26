// Run only against a synthetic Android profile. Replay explicitly chooses local demo.
import assert from "node:assert/strict";
import {
  nodes,
  find,
  bounds,
  tapNode,
  screen,
  shell,
  pause,
  scrollTop,
  screenSize,
} from "./android-harness.mjs";

const labels = (list = nodes()) =>
  list.map((n) => n.text || n["content-desc"]).filter(Boolean);
function waitFor(label) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const list = nodes();
    if (labels(list).includes(label)) return list;
    pause(300);
  }
  throw Error("Не появился экран: " + label);
}
function open(path) {
  shell(
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    "syncli://" + path,
    "ru.syncli.patient.demo",
  );
  pause(800);
}
function seek(label) {
  const [, height] = screenSize();
  for (let attempt = 0; attempt < 12; attempt++) {
    const node = find(label);
    if (node) {
      const [, top, , bottom] = bounds(node);
      if (top >= 60 && bottom <= height - 45) return node;
    }
    // The center can belong to a draggable feeling/world canvas. Use the page margin.
    shell(
      "input",
      "swipe",
      "12",
      String(Math.round(height * 0.82)),
      "12",
      String(Math.round(height * 0.3)),
      "350",
    );
    pause(300);
  }
  throw Error("Кнопка недоступна после прокрутки: " + label);
}
function press(label) {
  tapNode(seek(label));
  pause(500);
}
function doseGeometry() {
  open("plan");
  // A cold app can mount its initial tab after receiving a deep link.
  // Select the visible tab as a user would, without clearing the saved profile.
  if (!labels().includes("Мой план")) {
    waitFor("Лечение");
    press("Лечение");
  }
  waitFor("Мой план");
  scrollTop();
  const list = nodes();
  for (const label of ["Принял", "Пропустил"]) {
    const button = list.find((n) => n["content-desc"] === label);
    const text = list.find((n) => n.text === label);
    assert.ok(button && text, label + ": кнопка и текст должны быть видны");
    const [, by, , bb] = bounds(button),
      [, ty, , tb] = bounds(text);
    const offset = Math.abs((by + bb - ty - tb) / 2);
    assert.ok(
      offset <= 2,
      `${label}: текст смещён от середины на ${offset} px`,
    );
  }
  screen("plan-top");
  console.log(
    "PASS: текст обеих дозовых кнопок находится по вертикальной середине",
  );
}
function layout() {
  doseGeometry();
  assert.ok(labels().includes("Лечение"));
  assert.ok(
    !labels().some(
      (t) => t.includes("шаг за шагом") || t.includes("Для зачёта дня"),
    ),
  );
  seek("Связаться с врачом");
  screen("plan-contact");
  press("Связаться с врачом");
  waitFor("Обращение");
  seek("Отправить");
  screen("contact");
  const motion = shell(
    "settings",
    "get",
    "global",
    "transition_animation_scale",
  ).trim();
  try {
    // Continuous backdrop animation prevents UIAutomator's idle snapshot.
    // Use the app's supported reduced-motion mode for these static UI assertions.
    shell("settings", "put", "global", "transition_animation_scale", "0");
    pause(400);
    open("check-in");
    pause(800);
    let current = nodes();
    // A saved draft can correctly reopen on details/note; keep its answers and go back.
    for (
      let back = 0;
      back < 2 &&
      !current.some((n) => n["content-desc"]?.startsWith("Карта ощущений"));
      back++
    ) {
      const previous = find("Предыдущий шаг", current);
      assert.ok(previous, "У сохранённого шага должна быть кнопка возврата");
      tapNode(previous);
      pause(500);
      current = nodes();
    }
    const grid = current.find((n) =>
      n["content-desc"]?.startsWith("Карта ощущений"),
    );
    assert.ok(grid, "Карта ощущений должна быть доступна");
    tapNode(grid);
    assert.ok(labels().includes("РАДОСТЬ") && labels().includes("ГРУСТНО"));
    screen("report-feeling");
    press("Далее");
    waitFor("Ещё несколько наблюдений");
    assert.ok(
      !labels().some((t) => /обязат/i.test(t)),
      "На втором шаге не должно быть упоминаний обязательности",
    );
    screen("report-details");
  } finally {
    if (motion === "null")
      shell("settings", "delete", "global", "transition_animation_scale");
    else
      shell("settings", "put", "global", "transition_animation_scale", motion);
  }
  console.log(
    "PASS: лечение, связь с врачом, отправка, подписи карты и второй шаг отчёта",
  );
}
function replay() {
  open("settings");
  press("Пройти знакомство ещё раз");
  for (let step = 0; step <= 12; step++) {
    const current = labels(waitFor(`${step + 1} / 13`));
    assert.ok(
      !current.includes("Мой мир"),
      "Экран мира не должен открываться вместо шага знакомства",
    );
    screen("replay-" + String(step).padStart(2, "0"));
    if (step === 12) break;
    press(
      step === 0
        ? "Давайте знакомиться"
        : step === 1
          ? "Войти в демо-режиме"
          : step === 2
            ? "Это мой план"
            : step === 11
              ? "Продолжить"
              : "Дальше",
    );
  }
  press("На мой путь");
  console.log(
    "PASS: повторное знакомство прошло все 13 шагов без самопроизвольного экрана мира",
  );
}

if (process.argv.includes("--dose")) doseGeometry();
else if (process.argv.includes("--replay")) replay();
else if (process.argv.includes("--layout")) layout();
else {
  layout();
  replay();
}
