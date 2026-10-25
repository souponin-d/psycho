import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  shell,
  open,
  pause,
  tap,
  tapNode,
  seek,
  nodes,
  find,
  screen,
  bounds,
  dir,
  pkg,
} from "./android-harness.mjs";
const oldSize = shell("wm", "size").match(/Override size: (\d+x\d+)/)?.[1];
const oldFont = shell("settings", "get", "system", "font_scale").trim();
const oldTransition = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
const oldWifi = shell("settings", "get", "global", "wifi_on").trim();
const oldData = shell("settings", "get", "global", "mobile_data").trim();
let originalTheme = "Тема Рассвет",
  originalGame = true,
  originalHaptics = true;
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  open("settings");
  pause(800);
  tapNode(seek("Тема Рассвет"));
  const h = seek("Виброотклик");
  originalHaptics = h.checked === "true";
  if (originalHaptics) tapNode(h);
  assert.equal(seek("Виброотклик").checked, "false");
  if (originalHaptics) tapNode(seek("Виброотклик"));
  const g = seek("Живой берег");
  originalGame = g.checked === "true";
  if (originalGame) tapNode(g);
  open("/");
  tap("Сегодня");
  assert(!nodes().some((n) => n.text === "Мой путь"));
  screen("10-game-hidden");
  open("settings");
  tapNode(seek("Живой берег"));
  shell("wm", "size", "960x1920");
  shell("settings", "put", "system", "font_scale", "1.3");
  pause(1200);
  for (const [label, key] of [
    ["Тема Орбита", "dark"],
    ["Тема Лаванда", "lavender"],
    ["Тема Рассвет", "light"],
  ]) {
    open("settings");
    tapNode(seek(label));
    open("/");
    tap("Путь");
    assert(nodes().some((n) => n.text === "Мой путь"));
    const b = bounds(find("Вернуться к сегодняшнему дню"));
    assert(b[1] > 0 && b[3] <= 1920);
    screen("11-compact-" + key);
  }
  tap("Обустроить мой мир");
  tap("Спутник");
  screen("12-compact-wardrobe");
  tap("Закрыть мастерскую");
  tap("Отмена");
  tap("ОТМЕНИТЬ ИЗМЕНЕНИЯ");
  shell("svc", "wifi", "disable");
  shell("svc", "data", "disable");
  shell("am", "force-stop", pkg);
  open("/");
  pause(1800);
  if (find("Путь")) tap("Путь");
  screen("13-offline-cold-start");
  assert(nodes().some((n) => n.text === "Мой путь"));
  open("plan");
  assert(nodes().some((n) => n.text === "Авиандр"));
  screen("14-offline-plan");
  writeFileSync(
    join(dir, "ui-result.json"),
    JSON.stringify(
      {
        compact: "960x1920",
        fontScale: 1.3,
        themes: 3,
        wardrobeModal: true,
        hiddenGame: true,
        hapticsToggle: true,
        offlineColdStart: true,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: compact/font1.3/three themes/wardrobe/game hiding/haptics switch/offline cold start",
  );
} finally {
  if (oldSize) shell("wm", "size", oldSize);
  else shell("wm", "size", "reset");
  if (oldFont === "null") shell("settings", "delete", "system", "font_scale");
  else shell("settings", "put", "system", "font_scale", oldFont);
  if (oldTransition === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell(
      "settings",
      "put",
      "global",
      "transition_animation_scale",
      oldTransition,
    );
  if (oldWifi === "1") shell("svc", "wifi", "enable");
  if (oldData === "1") shell("svc", "data", "enable");
}
