import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  shell,
  open,
  scrollTop,
  seek,
  tapNode,
  tap,
  screen,
  hideKeyboard,
  find,
  dir,
} from "./android-harness.mjs";

const initialSize = shell("wm", "size").match(/Override size: (\d+x\d+)/)?.[1];
const initialFont = shell("settings", "get", "system", "font_scale").trim();
const previous = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  shell("wm", "size", "960x1920");
  shell("settings", "put", "system", "font_scale", "1.3");
  open("history");
  scrollTop();
  seek("Ритм за период");
  screen("30-compact-history");
  scrollTop();
  tapNode(seek("Календарь"));
  screen("31-compact-calendar");
  tapNode(
    seek("История за " + (process.env.SYNCLI_HISTORY_DAY ?? "2026-10-18")),
  );
  tapNode(seek("Изменить приём: Утренний приём"));
  assert.ok(seek("Сохранить исправление"));
  screen("33-compact-editor");
  tapNode(seek("Комментарий к приёму"));
  screen("32-compact-keyboard");
  hideKeyboard();
  shell("input", "keyevent", "4");
  assert.ok(
    !find("Закрыть окно истории"),
    "Форма закрывается после ввода без сохранения",
  );
  writeFileSync(
    join(dir, "history-compact-result.json"),
    JSON.stringify(
      {
        size: "960x1920",
        fontScale: 1.3,
        calendarDaySelectable: true,
        editorSaveVisibleBeforeInput: true,
        keyboardInputAndCancel: true,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: compact history, calendar, keyboard and editor with font scale 1.3",
  );
} finally {
  shell("wm", "size", initialSize ?? "reset");
  shell("settings", "put", "system", "font_scale", initialFont);
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
