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
let gameWas = true;
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  assert(shell("dumpsys", "package", pkg).includes("versionName=0.3.0"));
  open("/");
  pause(1400);
  if (find("Путь")) tap("Путь");
  tap("Вернуться к сегодняшнему дню");
  screen("50-final-world");
  open("settings");
  const game = seek("Живой берег");
  gameWas = game.checked === "true";
  if (gameWas) tapNode(game);
  const seed = process.env.SYNCLI_SEED_DAY ?? shell("date", "+%F").trim();
  const date = new Date(seed + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - 6);
  const past = date.toISOString().slice(0, 10);
  open("history?day=" + past);
  pause(500);
  screen("51-clinical-history");
  seek("Записи этого дня");
  const text = nodes()
    .map((n) => n.text || "")
    .join(" ");
  assert(
    !/День не зачтён|День выполнен|[Сс]трик|[Нн]аграды сохранены|Серия не пересчитывается/.test(
      text,
    ),
    "История не показывает игру при отказе от неё",
  );
  assert(text.includes("Записи этого дня"));
  open("settings");
  tapNode(seek("Живой берег"));
  open("check-in?personal=1");
  tap("Выбрать состояние кнопками");
  tapNode(seek("Приятнее"));
  tapNode(seek("Больше энергии"));
  screen("52-feeling-button-alternative");
  tapNode(seek("Вернуться к карте"));
  tap("Закрыть карту ощущений");
  open("settings");
  tapNode(seek("Синкли · 0.3.0"));
  screen("53-actual-version");
  assert(
    !nodes().some((n) => (n.text || "").includes("\\n")),
    "Нет буквального переноса в тексте интерфейса",
  );
  writeFileSync(
    join(dir, "android-final-result.json"),
    JSON.stringify(
      {
        version: "0.3.0",
        gameHiddenInHistory: true,
        clinicalFactsPreserved: true,
        feelingButtons: true,
        noLiteralNewline: true,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: final APK version, clinical-only history, feeling button alternative, generated copy",
  );
} finally {
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
