import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const adb =
  process.env.ANDROID_ADB ?? "D:/Programs/Android/SDK/platform-tools/adb.exe";
const serial = process.env.ANDROID_SERIAL ?? "emulator-5570";
const pkg = "ru.syncli.patient.demo";
const evidence = resolve(
  process.env.SYNCLI_EVIDENCE_DIR ?? "artifacts/mobile-shore",
);
mkdirSync(evidence, { recursive: true });
function command(...args) {
  return execFileSync(adb, ["-s", serial, ...args], {
    encoding: "utf8",
    timeout: 25000,
    maxBuffer: 12 * 1024 * 1024,
  });
}
function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function nodes() {
  let ready = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const output = command(
      "shell",
      "uiautomator",
      "dump",
      "--compressed",
      "/sdcard/syncli-verification.xml",
    );
    if (output.includes("dumped")) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350);
  }
  if (!ready) throw Error("Android accessibility tree unavailable");
  const xml = command("exec-out", "cat", "/sdcard/syncli-verification.xml");
  writeFileSync(join(evidence, "latest-ui.xml"), xml);
  return [...xml.matchAll(/<node\b([^>]+)>/g)].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [
        a[1],
        decode(a[2]),
      ]),
    ),
  );
}
function find(ns, label) {
  return (
    ns.find((n) => n["content-desc"] === label) ||
    ns.find((n) => n.text === label) ||
    ns.find((n) => n["content-desc"].startsWith(label + ", "))
  );
}
function center(node) {
  const b = [...node.bounds.matchAll(/\d+/g)].map((x) => +x[0]);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2].map(Math.round);
}
function tap(label) {
  const ns = nodes(),
    n = find(ns, label);
  if (!n)
    throw Error(
      "Missing " +
        label +
        "; visible: " +
        ns
          .map((x) => x["content-desc"] || x.text)
          .filter(Boolean)
          .join(" | "),
    );
  if (n.enabled === "false") throw Error("Disabled " + label);
  command("shell", "input", "tap", ...center(n).map(String));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350);
}
function screen(name) {
  writeFileSync(
    join(evidence, name + ".png"),
    execFileSync(adb, ["-s", serial, "exec-out", "screencap", "-p"], {
      maxBuffer: 12 * 1024 * 1024,
    }),
  );
}
function assertVisible(value) {
  if (
    !nodes().some(
      (n) =>
        (n.text || "").includes(value) ||
        (n["content-desc"] || "").includes(value),
    )
  )
    throw Error("Not visible: " + value);
}
function swipeUp() {
  command("shell", "input", "swipe", "540", "1850", "540", "650", "350");
}
function back() {
  command("shell", "input", "keyevent", "4");
}
function text(value) {
  command("shell", "input", "text", value);
}
const phase = process.argv[2] ?? "inspect";
if (phase === "inspect") {
  console.log(
    nodes()
      .map((n) => ({
        text: n.text,
        desc: n["content-desc"],
        enabled: n.enabled,
        bounds: n.bounds,
        selected: n.selected,
      }))
      .filter((n) => n.text || n.desc),
  );
  screen("inspect");
} else if (phase === "prepare") {
  command("shell", "am", "start", "-W", "-n", pkg + "/.MainActivity");
  screen("00-before-update");
  tap("Как вы себя чувствуете?");
  tap("Самочувствие: Хорошо");
  swipeUp();
  tap("Сохранить момент");
  assertVisible("Момент сохранён");
  tap("Посмотреть историю");
  assertVisible("Хорошо");
  screen("01-legacy-history");
  writeFileSync(
    join(evidence, "legacy-evidence.json"),
    JSON.stringify(
      {
        package: pkg,
        version: "0.1.0",
        createdMood: "Хорошо",
        date: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Prepared old 0.1.0 record without coordinates.");
} else if (phase === "home") {
  command("shell", "am", "force-stop", pkg);
  command("shell", "am", "start", "-W", "-n", pkg + "/.MainActivity");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  assertVisible("Тихий берег");
  screen("02-home-after-update");
  const visible = nodes();
  if (visible.some((n) => /Демо|прототип/i.test(n.text || "")))
    throw Error("Demo badge found");
  tap("История");
  assertVisible("Хорошо");
  screen("03-old-record-retained");
  tap("День");
  tap("Отметить самочувствие");
  screen("04-feeling-unselected");
  const ns = nodes(),
    save = find(ns, "Сохранить момент");
  if (!save || save.enabled !== "false")
    throw Error("Saving unselected mood is enabled");
  const grid = find(ns, "Карта ощущений");
  if (!grid) throw Error("Missing feeling grid");
  const b = [...grid.bounds.matchAll(/\d+/g)].map((x) => +x[0]);
  command(
    "shell",
    "input",
    "swipe",
    String(Math.round(b[0] + (b[2] - b[0]) * 0.2)),
    String(Math.round(b[1] + (b[3] - b[1]) * 0.8)),
    String(Math.round(b[0] + (b[2] - b[0]) * 0.8)),
    String(Math.round(b[1] + (b[3] - b[1]) * 0.2)),
    "650",
  );
  assertVisible("Воодушевление");
  screen("05-joy");
  tap("Добавить название, сон и заметку");
  tap("Название ощущения");
  text("MyMoment");
  back();
  tap("Вернуться к карте");
  tap("Выбрать состояние кнопками");
  tap("Меньше энергии");
  tap("Вернуться к карте");
  assertVisible("MyMoment");
  tap("Сохранить момент");
  assertVisible("Момент сохранён");
  screen("06-saved");
  tap("Вернуться на берег");
  screen("07-home-with-memory");
  tap("Открыть вопросы к приёму");
  tap("Новый вопрос к приёму");
  text("Question_for_visit");
  back();
  tap("Сохранить вопрос");
  assertVisible("Question_for_visit");
  screen("08-questions");
  back();
  tap("Настроить мой уголок");
  assertVisible("Фонарь");
  screen("09-decoration");
  console.log(
    "Native basic flow passed; persisted record MyMoment and question Question_for_visit.",
  );
} else if (phase === "restart") {
  command("shell", "am", "force-stop", pkg);
  command("shell", "am", "start", "-W", "-n", pkg + "/.MainActivity");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  tap("История");
  assertVisible("MyMoment");
  screen("10-persisted-history");
  tap("День");
  tap("Открыть вопросы к приёму");
  assertVisible("Question_for_visit");
  back();
  tap("Настройки");
  screen("11-settings");
  console.log("Restart persistence passed.");
} else if (phase === "expressions") {
  tap("Тема Орбита");
  back();
  assertVisible("Тихий берег");
  screen("12-shore-dark");
  tap("Отметить самочувствие");
  const expected = [
    "Усталость",
    "Тихо",
    "Спокойствие",
    "Грусть",
    "Ровно",
    "Хорошо",
    "Напряжение",
    "Волнение",
    "Воодушевление",
  ];
  const coordinates = [0.2, 0.5, 0.8];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const grid = find(nodes(), "Карта ощущений"),
        b = [...grid.bounds.matchAll(/\d+/g)].map((x) => +x[0]);
      command(
        "shell",
        "input",
        "tap",
        String(Math.round(b[0] + (b[2] - b[0]) * coordinates[col])),
        String(Math.round(b[1] + (b[3] - b[1]) * coordinates[2 - row])),
      );
      const name = expected[row * 3 + col];
      assertVisible(name);
      screen("expression-" + String(row * 3 + col + 1));
    }
  tap("Закрыть карту ощущений");
  tap("Настройки");
  tap("Тема Рассвет");
  back();
  screen("13-shore-light");
  console.log("All nine native expressions and both themes passed.");
} else if (phase === "compact") {
  tap("День");
  assertVisible("Тихий берег");
  screen("14-compact-shore");
  tap("Настроить мой уголок");
  assertVisible("Украшение берега");
  back();
  tap("План");
  assertVisible("План на сегодня");
  tap("День");
  tap("Отметить самочувствие");
  screen("15-compact-feeling");
  const grid = find(nodes(), "Карта ощущений"),
    b = [...grid.bounds.matchAll(/\d+/g)].map((x) => +x[0]);
  if (Math.abs(b[2] - b[0] - (b[3] - b[1])) > 3)
    throw Error("Compact grid is not square");
  tap("Выбрать состояние кнопками");
  tap("Приятнее");
  tap("Вернуться к карте");
  tap("Закрыть карту ощущений");
  console.log("Compact shore, house, plan and square accessible grid passed.");
} else if (phase === "preferences") {
  tap("Настройки");
  for (let i = 0; i < 4 && !find(nodes(), "Виброотклик"); i++) swipeUp();
  tap("Виброотклик");
  tap("Живой берег");
  if (find(nodes(), "Виброотклик").checked !== "false")
    throw Error("Haptics switch failed");
  screen("16-preferences-off");
  back();
  assertVisible("Настроить берег");
  screen("17-shore-without-game");
  command("shell", "am", "force-stop", pkg);
  command("shell", "am", "start", "-W", "-n", pkg + "/.MainActivity");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  tap("Настройки");
  for (let i = 0; i < 4 && !find(nodes(), "Виброотклик"); i++) swipeUp();
  if (
    find(nodes(), "Виброотклик").checked !== "false" ||
    find(nodes(), "Живой берег").checked !== "false"
  )
    throw Error("Preferences not persisted");
  tap("Виброотклик");
  tap("Живой берег");
  back();
  tap("Настроить мой уголок");
  tap("Фонарь. Доступно");
  assertVisible("Фонарь. Выбрано");
  screen("18-lantern-selected");
  back();
  console.log("Haptics and game toggles persist; decoration selection passed.");
} else if (phase === "motion") {
  tap("Отметить самочувствие");
  const grid = find(nodes(), "Карта ощущений"),
    b = [...grid.bounds.matchAll(/\d+/g)].map((x) => +x[0]);
  command(
    "shell",
    "input",
    "tap",
    String(Math.round(b[0] + (b[2] - b[0]) * 0.8)),
    String(Math.round(b[1] + (b[3] - b[1]) * 0.2)),
  );
  assertVisible("Воодушевление");
  command(
    "shell",
    "settings",
    "put",
    "global",
    "transition_animation_scale",
    "1.0",
  );
  for (let i = 1; i <= 3; i++) {
    command("shell", "sleep", "0.6");
    screen("motion-" + i);
  }
  command(
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.MAIN",
    "-c",
    "android.intent.category.HOME",
  );
  command("shell", "am", "start", "-W", "-n", pkg + "/.MainActivity");
  command(
    "shell",
    "settings",
    "put",
    "global",
    "transition_animation_scale",
    "0",
  );
  assertVisible("Воодушевление");
  tap("Закрыть карту ощущений");
  console.log(
    "Native motion captured; background/resume retained the draft without crash.",
  );
} else throw Error("Unknown phase");
