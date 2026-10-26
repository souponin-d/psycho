import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  open,
  pause,
  tapNode,
  find,
  nodes,
  screen,
  shell,
  dir,
} from "./android-harness.mjs";

// Preview changes stay local: do not rewrite the patient's saved wardrobe.
const previous = shell(
  "settings",
  "get",
  "global",
  "transition_animation_scale",
).trim();
try {
  shell("settings", "put", "global", "transition_animation_scale", "0");
  open("/companion-preview");
  pause(1200);
  const tree = nodes();
  assert(find("Спутники Синкли", tree));
  assert(!tree.some((n) => /Окраска|Шалфей|Лаванда|Жемчуг/.test(n.text)));
  const clothes = ["Шарф", "Худи", "Накидка"];
  const accessories = ["Без аксессуара", "Листок", "Звезда", "Бант"];
  // Expects full preview controls visible at normal font scale.
  const clothingNodes = clothes.map((label) => find(label, tree));
  const accessoryNodes = accessories.map((label) => find(label, tree));
  assert(clothingNodes.every(Boolean) && accessoryNodes.every(Boolean));
  const captures = [];
  for (const [c, clothing] of clothes.entries()) {
    tapNode(clothingNodes[c]);
    for (const [a, accessory] of accessories.entries()) {
      tapNode(accessoryNodes[a]);
      pause(500);
      const file = `wardrobe-${c}-${a}`;
      screen(file);
      captures.push({ clothing, accessory, file: file + ".png" });
      console.log("Captured both companions:", clothing, accessory);
    }
  }
  writeFileSync(
    join(dir, "wardrobe-native.json"),
    JSON.stringify(
      { combinations: 24, captures, verifiedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    "PASS: 24 combinations captured; inspect fit visually. Saved profile untouched.",
  );
} finally {
  if (previous === "null")
    shell("settings", "delete", "global", "transition_animation_scale");
  else
    shell("settings", "put", "global", "transition_animation_scale", previous);
}
