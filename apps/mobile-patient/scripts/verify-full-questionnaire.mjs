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
} from "./android-harness.mjs";
const user = shell("am", "get-current-user").trim();
assert.notEqual(user, "0", "Только изолированный тестовый профиль");
assert(shell("pm", "list", "users").includes(user + ":SyncliQA"));
open("questionnaire?id=phq-control");
tapNode(seek("Несколько дней"));
tapNode(seek("Далее"));
pause(500);
screen("10-phq-draft");
shell("am", "force-stop", "--user", user, pkg);
open("/");
pause(1500);
open("questionnaire?id=phq-control");
assert.equal(
  seek("Несколько дней").selected,
  "true",
  "Ответ восстановлен из SQLite после остановки процесса",
);
tapNode(seek("Далее"));
for (let i = 1; i < 9; i++) {
  tapNode(seek("Ни разу"));
  tapNode(seek("Далее"));
}
tapNode(seek("Совсем не трудно"));
tapNode(seek("Завершить опрос"));
const text = nodes()
  .map((n) => n.text || "")
  .join(" ");
assert(text.includes("Опрос завершён"));
assert(!/балл|результат|диагноз/i.test(text));
screen("11-phq-completed-no-results");
open("plan");
screen("12-plan-test-completed");
writeFileSync(
  join(dir, "questionnaire-native-result.json"),
  JSON.stringify(
    {
      isolatedUser: user,
      phq9Questions: 9,
      conditionalImpact: true,
      draftAfterForceStop: true,
      completedWithoutResults: true,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "PASS: complete native PHQ9, conditional impact, draft restart, completion only",
);
