import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  shell,
  open,
  seek,
  tapNode,
  find,
  nodes,
  fill,
  screen,
  pause,
  dir,
  pkg,
  scrollTop,
} from "./android-harness.mjs";

const previous = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  shell("wm", "dismiss-keyguard");
  shell("cmd", "statusbar", "collapse");
  open("plan");
  scrollTop();
  seek("Принял");
  const clear = find("Убрать ошибочную отметку");
  if (clear) tapNode(clear);
  assert.notEqual(
    find("Принял")?.selected,
    "true",
    "Перед проверкой приём ещё не отмечен",
  );
  const clock = Number(shell("date", "+%s").trim()) * 1000;
  const at = Math.ceil((clock + 45000) / 60000) * 60000;
  const offset = shell("date", "+%z").trim();
  const offsetMinutes =
    (offset[0] === "-" ? -1 : 1) *
    (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
  const time = new Date(at + offsetMinutes * 60000).toISOString().slice(11, 16);
  open("settings");
  scrollTop();
  tapNode(seek("Время приёма препарата"));
  fill("Время приёма препарата", time);
  tapNode(seek("Сохранить время"));
  console.log("Waiting for actual dose reminder at " + time);
  shell("input", "keyevent", "3");
  shell("am", "start", "-W", "-a", "android.settings.SETTINGS");
  shell("input", "keyevent", "3");
  shell("am", "kill", pkg);
  pause(500);
  assert.ok(
    !shell("ps", "-A")
      .split("\n")
      .some((line) => line.trim().endsWith(" " + pkg)),
    "Процесс завершён до сигнала",
  );
  const remaining = at - Number(shell("date", "+%s").trim()) * 1000;
  assert.ok(remaining > 0, "Осталось время до назначенного сигнала");
  let wait = remaining + 3000;
  while (wait > 0) {
    const chunk = Math.min(wait, 30000);
    pause(chunk);
    wait -= chunk;
  }
  shell("cmd", "statusbar", "expand-notifications");
  pause(1000);
  let action = find("Принял");
  if (!action) {
    const expand = nodes().find((n) =>
      /Expand|Развернуть/.test(n["content-desc"] || ""),
    );
    if (expand) tapNode(expand);
    action = find("Принял");
  }
  screen("12-dose-notification");
  assert.ok(action, "Уведомление содержит действие Принял");
  tapNode(action);
  pause(4000);
  assert.ok(
    !shell("dumpsys", "activity", "activities")
      .split("\n")
      .some((line) => /topResumedActivity/.test(line) && line.includes(pkg)),
    "Принял обрабатывается без открытия приложения",
  );
  shell("cmd", "statusbar", "collapse");
  open("plan");
  scrollTop();
  assert.equal(
    seek("Принял")?.selected,
    "true",
    "Фоновая отметка сохранена в Плане",
  );
  screen("13-background-action-saved");
  writeFileSync(
    join(dir, "notification-action-result.json"),
    JSON.stringify(
      {
        processTerminatedBeforeDelivery: true,
        actionWithoutOpeningApp: true,
        persistedTaken: true,
        reminderTime: time,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: background action persists a dose without opening the application",
  );
} finally {
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
