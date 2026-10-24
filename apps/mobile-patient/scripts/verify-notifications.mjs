import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  shell,
  open,
  seek,
  tapNode,
  tap,
  nodes,
  pause,
  screen,
  dir,
  pkg,
} from "./android-harness.mjs";

const previous = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
const lockDisabled = shell("locksettings", "get-disabled").trim();
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  open("settings");
  const probeButton = seek("Проверить уведомление через 15 секунд");
  const requestedAt = Date.now();
  tapNode(probeButton);
  assert.ok(nodes().some((n) => n.text === "Проверка назначена"));
  tap("OK");
  const scheduledAt = new Date().toISOString();
  shell("input", "keyevent", "3");
  // Move a different app into Android's previous-process slot; otherwise
  // am kill may keep the recently backgrounded app alive during its grace period.
  shell("am", "start", "-W", "-a", "android.settings.SETTINGS");
  shell("input", "keyevent", "3");
  shell("am", "kill", pkg);
  pause(500);
  // Unlike force-stop, killing a cached process preserves Android alarms.
  const processes = shell("ps", "-A");
  assert.ok(
    !processes.split("\n").some((line) => line.trim().endsWith(" " + pkg)),
    "Процесс приложения завершён до доставки",
  );
  assert.ok(
    Date.now() - requestedAt < 15000,
    "Процесс завершён до назначенного времени сигнала",
  );
  shell("locksettings", "set-disabled", "false");
  shell("input", "keyevent", "223");
  pause(16000);
  const notifications = shell("dumpsys", "notification", "--noredact");
  assert.ok(
    notifications.includes("Проверка напоминаний: всё на связи."),
    "Android доставил уведомление без процесса приложения",
  );
  writeFileSync(
    join(dir, "notification-record.txt"),
    notifications
      .split("\n")
      .filter((line) =>
        /syncli|Проверка напоминаний|android.title=String \(Синкли\)/.test(
          line,
        ),
      )
      .join("\n"),
  );
  shell("input", "keyevent", "224");
  pause(500);
  assert.match(
    shell("dumpsys", "window", "policy"),
    /showing=true/,
    "Включён экран блокировки",
  );
  screen("10-closed-app-notification");
  writeFileSync(
    join(dir, "notification-result.json"),
    JSON.stringify(
      {
        processTerminatedBeforeDelivery: true,
        deliveredByAndroid: true,
        lockScreenVerified: true,
        exactPermission: shell(
          "cmd",
          "appops",
          "get",
          pkg,
          "SCHEDULE_EXACT_ALARM",
        ).trim(),
        scheduledAt,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: notification delivered by Android after application process was killed",
  );
} finally {
  shell("locksettings", "set-disabled", lockDisabled);
  shell("wm", "dismiss-keyguard");
  shell("input", "keyevent", "224");
  shell("input", "keyevent", "82");
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
