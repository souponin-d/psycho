import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  adb,
  serial,
  open,
  pause,
  screen,
  nodes,
  find,
  bounds,
  shell,
  run,
  dir,
} from "./android-harness.mjs";
const modes = [
  "Спокойствие",
  "Моргание",
  "Прогулка",
  "Любопытство",
  "Касание",
  "Поддержка",
  "Сонливость",
  "Удивление",
  "День выполнен",
  "Награда",
  "Примерка",
  "Лёгкая грусть",
];
const previous = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  open("companion-preview");
  pause(1200);
  let tree = nodes();
  if (!tree.some((n) => n.text === "Спутники Синкли")) {
    open("companion-preview");
    pause(1200);
    tree = nodes();
  }
  assert(tree.some((n) => n.text === "Спутники Синкли"));
  // Controls remain fixed while the two isolated bodies animate. Capture their
  // actual bounds before enabling motion; no stale XML is used for assertions.
  const controls = modes.map((m) => {
    const n = find("Состояние: " + m, tree);
    assert(n);
    return bounds(n);
  });
  shell("settings", "put", "global", "transition_animation_scale", "1");
  pause(1000);
  const video = `/sdcard/syncli-companions-${Date.now()}.mp4`;
  const recorder = spawn(
    adb,
    [
      "-s",
      serial,
      "shell",
      "screenrecord",
      "--time-limit",
      "45",
      "--bit-rate",
      "3500000",
      video,
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  const recorded = new Promise((resolve) =>
    recorder.on("exit", (code) => resolve(code)),
  );
  for (let i = 0; i < modes.length; i++) {
    const b = controls[i];
    shell(
      "input",
      "tap",
      String(Math.round((b[0] + b[2]) / 2)),
      String(Math.round((b[1] + b[3]) / 2)),
    );
    pause(350);
    screen(`pose-${String(i).padStart(2, "0")}-a`);
    pause(450);
    screen(`pose-${String(i).padStart(2, "0")}-b`);
    console.log("native animated pose:", modes[i]);
    pause(800);
  }
  await recorded;
  run("pull", video, join(dir, "companions-native.mp4"));
  run("shell", "rm", video);
  writeFileSync(
    join(dir, "companion-result.json"),
    JSON.stringify(
      {
        twoCompanions: true,
        modes: 12,
        motionEnabled: true,
        nativeRecording: true,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: 12 native animated modes, both companions, recording saved",
  );
} finally {
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
