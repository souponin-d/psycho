import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  shell,
  open,
  nodes,
  find,
  tap,
  tapNode,
  seek,
  fill,
  screen,
  dir,
  pause,
} from "./android-harness.mjs";

const previous = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  open("onboarding");
  tapNode(seek("Давайте знакомиться"));
  tapNode(seek("Подключить план"));
  assert.ok(
    nodes().some((n) => (n.text || "").includes("Код не подошёл")),
    "Пустой код не пропускает подключение",
  );
  screen("01-invite-validation");
  tapNode(seek("Войти в демо-режиме"));
  assert.ok(nodes().some((n) => n.text === "Авиандр"));
  screen("02-assigned-plan");
  tapNode(seek("Это мой план"));
  tapNode(seek("Выбрать: Облачко"));
  tapNode(seek("Дальше"));
  screen("03-theme");
  tapNode(seek("Дальше"));
  assert.ok(find("Личная цель"));
  tapNode(seek("Дальше"));
  fill("Время утреннего напоминания", "07:45");
  tapNode(seek("Продолжить"));
  screen("04-guide");
  tapNode(seek("На мой путь"));
  assert.ok(nodes().some((n) => n.text === "Мой путь"));
  screen("05-journey-after-onboarding");
  open("settings");
  const time = seek("Время приёма препарата");
  assert.ok(time);
  assert.ok(
    nodes().some((n) => n.text === "07:45"),
    "Время сохранено после онбординга",
  );
  writeFileSync(
    join(dir, "onboarding-result.json"),
    JSON.stringify(
      {
        codeRequired: true,
        demoEntry: true,
        eightSteps: true,
        timePersisted: true,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: onboarding, required code, demo, mascot, theme, goal and saved reminder time",
  );
} finally {
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
  pause(100);
}
