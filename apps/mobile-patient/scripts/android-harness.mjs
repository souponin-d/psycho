import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const adb =
  process.env.ANDROID_ADB ?? "D:/Programs/Android/SDK/platform-tools/adb.exe";
export const serial = process.env.ANDROID_SERIAL ?? "emulator-5570";
export const pkg = "ru.syncli.patient.demo";
export const dir = resolve(
  process.env.SYNCLI_EVIDENCE_DIR ?? "artifacts/mobile-journey-care",
);
mkdirSync(dir, { recursive: true });
export const run = (...args) =>
  execFileSync(adb, ["-s", serial, ...args], {
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
export const shell = (...args) => run("shell", ...args).toString();
export const pause = (ms = 600) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function nodes() {
  shell("uiautomator", "dump", "--compressed", "/sdcard/journey-care.xml");
  const xml = run("exec-out", "cat", "/sdcard/journey-care.xml").toString();
  writeFileSync(join(dir, "latest.xml"), xml);
  return [...xml.matchAll(/<node\b([^>]+)>/g)].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [
        a[1],
        a[2]
          .replace(/&quot;/g, '"')
          .replace(/&#10;/g, "\n")
          .replace(/&amp;/g, "&"),
      ]),
    ),
  );
}
export const bounds = (node) =>
  [...node.bounds.matchAll(/\d+/g)].map((v) => Number(v[0]));
export function find(label, list = nodes()) {
  return (
    list.find(
      (n) => n["content-desc"] === label && bounds(n)[3] > bounds(n)[1],
    ) ??
    list.find(
      (n) =>
        (n["content-desc"] === label || n.text === label) &&
        bounds(n)[3] > bounds(n)[1],
    )
  );
}
export function tapNode(n) {
  if (!n) throw new Error("Элемент не найден");
  if (n.enabled === "false")
    throw new Error("Элемент недоступен: " + (n["content-desc"] || n.text));
  const b = bounds(n);
  shell(
    "input",
    "tap",
    String(Math.round((b[0] + b[2]) / 2)),
    String(Math.round((b[1] + b[3]) / 2)),
  );
  pause();
}
export function tap(label) {
  tapNode(find(label));
}
export function screen(name) {
  writeFileSync(join(dir, name + ".png"), run("exec-out", "screencap", "-p"));
}
export function seek(label) {
  const [, w, h] = shell("wm", "size")
    .match(/(\d+)x(\d+)/)
    .map(Number);
  for (let i = 0; i < 12; i++) {
    const n = find(label);
    if (n && bounds(n)[1] >= 90 && bounds(n)[3] < h - 100) return n;
    shell(
      "input",
      "swipe",
      String(Math.round(w / 2)),
      String(Math.round(h * 0.82)),
      String(Math.round(w / 2)),
      String(Math.round(h * 0.3)),
      "500",
    );
    pause();
  }
  throw Error("Не найдено после прокрутки: " + label);
}
export function fill(label, text) {
  tap(label);
  shell("input", "keyevent", "123");
  for (let i = 0; i < 40; i++) shell("input", "keyevent", "67");
  shell("input", "text", text);
  shell("input", "keyevent", "4");
  pause();
}
export function open(path) {
  shell(
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    "syncli://" + path,
    pkg,
  );
  pause();
}
export function scrollTop() {
  const [, w, h] = shell("wm", "size")
    .match(/(\d+)x(\d+)/)
    .map(Number);
  for (let i = 0; i < 5; i++)
    shell(
      "input",
      "swipe",
      String(Math.round(w / 2)),
      String(Math.round(h * 0.32)),
      String(Math.round(w / 2)),
      String(Math.round(h * 0.84)),
      "300",
    );
  pause();
}
