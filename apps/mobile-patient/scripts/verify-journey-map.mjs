import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const adb =
  process.env.ANDROID_ADB ?? "D:/Programs/Android/SDK/platform-tools/adb.exe";
const serial = process.env.ANDROID_SERIAL ?? "emulator-5570";
const dir = resolve(
  process.env.SYNCLI_EVIDENCE_DIR ?? "artifacts/mobile-journey-map",
);
mkdirSync(dir, { recursive: true });
const run = (...args) =>
  execFileSync(adb, ["-s", serial, ...args], {
    timeout: 30000,
    maxBuffer: 12 * 1024 * 1024,
  });
const shell = (...args) => run("shell", ...args).toString();
const pause = () =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
function snapshot(name) {
  shell("uiautomator", "dump", "--compressed", "/sdcard/journey-map.xml");
  const xml = run("exec-out", "cat", "/sdcard/journey-map.xml").toString();
  writeFileSync(join(dir, `${name}.xml`), xml);
  writeFileSync(join(dir, `${name}.png`), run("exec-out", "screencap", "-p"));
  return xml;
}
function tap(xml, label) {
  const node = [...xml.matchAll(/<node\b([^>]+)>/g)].find((n) =>
    n[1].includes(`content-desc="${label}"`),
  );
  assert.ok(node, `Нет кнопки ${label}`);
  const b = node[1]
    .match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    .slice(1)
    .map(Number);
  shell(
    "input",
    "tap",
    String(Math.round((b[0] + b[2]) / 2)),
    String(Math.round((b[1] + b[3]) / 2)),
  );
  pause();
}
const previous = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  pause();
  const initial = snapshot("01-today");
  assert.ok(initial.includes("Мой путь"), "Открыта карта пути");
  const size = shell("wm", "size")
    .match(/(\d+)x(\d+)/)
    .slice(1)
    .map(Number);
  const [w, h] = size;
  shell(
    "input",
    "swipe",
    String(Math.round(w / 2)),
    String(Math.round(h * 0.42)),
    String(Math.round(w / 2)),
    String(Math.round(h * 0.76)),
    "700",
  );
  pause();
  const past = snapshot("02-past");
  const dated = (xml) =>
    [
      ...xml.matchAll(
        /content-desc="([^"]*День пути[^"]*)"[^>]*bounds="([^"]*)"/g,
      ),
    ].map((m) => [m[1], m[2]]);
  assert.notDeepEqual(
    dated(past),
    dated(initial),
    "Жест действительно переместил точки пути",
  );
  tap(past, "Вернуться к сегодняшнему дню");
  const returned = snapshot("03-returned");
  assert.deepEqual(
    dated(returned),
    dated(initial),
    "Кнопка вернула исходную позицию сегодня",
  );
  const todayLabel = returned.match(
    /content-desc="([^"]*Сегодня\. День пути[^"]*)"/,
  );
  assert.ok(todayLabel, "Сегодняшняя точка доступна после возврата");
  tap(returned, todayLabel[1]);
  const details = snapshot("04-day-details");
  assert.ok(
    details.includes("Самоотчёт"),
    "Точка открывает обязательные дела дня",
  );
  tap(details, "Закрыть день");
  writeFileSync(
    join(dir, "result.json"),
    JSON.stringify(
      {
        verticalScroll: true,
        returnToToday: true,
        dayDetails: true,
        serial,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("PASS: vertical scroll and return to today on Android");
} finally {
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
