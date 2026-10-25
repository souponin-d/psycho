import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  open,
  pause,
  tap,
  tapNode,
  seek,
  find,
  nodes,
  screen,
  shell,
  pkg,
  dir,
} from "./android-harness.mjs";
open("/");
pause(1400);
if (find("Путь")) tap("Путь");
tap("Обустроить мой мир");
tap("Спутник");
tap("Облачко");
tapNode(seek("Окраска: Жемчуг"));
tapNode(seek("Одежда: Худи"));
tapNode(seek("Аксессуар: Звезда"));
screen("wardrobe-cloud-hoodie");
tap("Закрыть мастерскую");
tap("Готово");
shell("am", "force-stop", pkg);
open("/");
pause(1500);
if (find("Путь")) tap("Путь");
tap("Обустроить мой мир");
tap("Спутник");
for (const label of ["Окраска: Жемчуг", "Одежда: Худи", "Аксессуар: Звезда"]) {
  const n = seek(label);
  assert.equal(n.selected, "true", label + " сохранён после остановки");
}
// Only the previewed wardrobe changes when switching the mascot in this draft.
tapNode(seek("Пушистик"));
for (const label of ["Окраска: Шалфей", "Одежда: Шарф", "Аксессуар: Листок"]) {
  const n = seek(label);
  assert.equal(n.selected, "true", label + " у пушистика сохранён независимо");
}
screen("wardrobe-fluffy-independent");
tapNode(seek("Облачко"));
tap("Закрыть мастерскую");
tap("Готово");
writeFileSync(
  join(dir, "wardrobe-result.json"),
  JSON.stringify(
    {
      cloudOutfitPersisted: true,
      fluffyWardrobeIndependent: true,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log("PASS: independent native wardrobes persisted after restart");
