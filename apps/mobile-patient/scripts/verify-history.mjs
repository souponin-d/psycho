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
  const seed = process.env.SYNCLI_SEED_DAY ?? shell("date", "+%F").trim();
  const date = new Date(seed + "T12:00Z");
  date.setUTCDate(date.getUTCDate() - 6);
  const past = date.toISOString().slice(0, 10);
  open("history");
  scrollTop();
  seek("Ритм за период");
  screen("20-history-summary");
  tapNode(seek("30 дней"));
  screen("21-history-30-days");
  tapNode(seek("Календарь"));
  screen("22-history-calendar");
  tapNode(seek("История за " + past));
  tapNode(seek("Изменить приём: Утренний приём"));
  tapNode(seek("Принят"));
  fill("Комментарий к приёму", "History-QA");
  tapNode(seek("Сохранить исправление"));
  pause(500);
  assert.ok(
    nodes().some((n) => n.text === "History-QA"),
    "Комментарий сохранён",
  );
  assert.ok(
    nodes().some((n) => (n.text || "").includes("Серия не пересчитывается")),
    "Исправление не восстанавливает закрытый игровой итог",
  );
  screen("23-history-dose-correction");
  tapNode(seek("Редактировать запись"));
  tapNode(seek("Добавить название, сон и заметку"));
  tapNode(seek("Заметка о моменте"));
  fill("Заметка о моменте", "Report-QA");
  tapNode(seek("Вернуться к карте"));
  tapNode(seek("Сохранить момент"));
  assert.ok(nodes().some((n) => n.text === "Изменения сохранены"));
  tapNode(seek("Открыть историю"));
  // Return to the edited date explicitly; exports include the whole period.
  scrollTop();
  tapNode(seek("Календарь"));
  tapNode(seek("История за " + past));
  tapNode(seek("Сохранить историю в файл"));
  tapNode(seek("Вся история"));
  const names = {};
  for (const format of ["json", "pdf"]) {
    tapNode(seek(format === "json" ? "Создать JSON" : "Создать PDF"));
    let name;
    for (let i = 0; i < 12; i++) {
      name = nodes()
        .map((n) => n.text)
        .find(
          (s) => s?.startsWith("syncli-history-") && s.endsWith("." + format),
        );
      if (name) break;
      if (find("Файл не создан"))
        throw Error("Нативное создание " + format + " не удалось");
      pause(500);
    }
    assert.ok(name, "Создан файл " + format);
    names[format] = name;
    screen("24-export-" + format);
  }
  writeFileSync(
    join(dir, "history-result.json"),
    JSON.stringify(
      {
        period30: true,
        calendar: true,
        doseEdit: true,
        closedGameUnchanged: true,
        reportEdit: true,
        jsonCreated: true,
        pdfCreated: true,
        files: names,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: history, calendar, historical dose/report corrections, native JSON and PDF creation",
  );
} finally {
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
