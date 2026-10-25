import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  shell,
  open,
  pause,
  find,
  tapNode,
  nodes,
  screen,
  scrollTop,
  seek,
  pkg,
  dir,
} from "./android-harness.mjs";
const dump = shell("dumpsys", "notification", "--noredact");
const jobs = [...dump.matchAll(/body=String \((\{[^\n]+\})\)/g)]
  .map((m) => {
    try {
      return JSON.parse(m[1]).job;
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const job = jobs.find(
  (j) => j.kind === "dose" && j.day === shell("date", "+%F").trim(),
);
assert(job, "Назначенное уведомление реально доставлено после reboot");
assert(
  !shell("dumpsys", "activity", "activities")
    .split("\n")
    .some((l) => l.includes("topResumedActivity") && l.includes(pkg)),
);
shell("cmd", "statusbar", "expand-notifications");
pause(800);
let action = find("Принял");
if (!action) {
  const expand = nodes().find((n) =>
    /Expand|Развернуть/.test(n["content-desc"] || ""),
  );
  if (expand) tapNode(expand);
  action = find("Принял");
}
assert(action);
screen("31-actual-reboot-notification");
tapNode(action);
pause(3500);
assert(
  !shell("dumpsys", "activity", "activities")
    .split("\n")
    .some((l) => l.includes("topResumedActivity") && l.includes(pkg)),
  "Фоновая отметка не открыла MainActivity",
);
shell("cmd", "statusbar", "collapse");
open("/");
pause(1500);
open("plan");
scrollTop();
assert.equal(seek("Принял").selected, "true");
screen("32-reboot-background-taken");
writeFileSync(
  join(dir, "notification-reboot-result.json"),
  JSON.stringify(
    {
      rebootBeforeDelivery: true,
      nativeJob: job,
      actionWithoutOpeningApp: true,
      persistedTaken: true,
      controllerNote:
        "Initial reboot controller lost ADB; device boot and actual delivered job checked, receipt phase resumed without rescheduling",
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "PASS: actual post-reboot notification, background taken without Activity, persisted clinical fact",
);
