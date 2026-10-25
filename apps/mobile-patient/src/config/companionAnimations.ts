import type { CompanionMode } from "../core/companion.ts";
export const companionAnimations: Record<
  CompanionMode,
  { group: "idle" | "walk" | "emotion"; frames: number[] }
> = {
  idle: { group: "idle", frames: [0, 0, 0, 0, 0, 1, 2, 1, 0, 3, 0, 0] },
  blink: { group: "idle", frames: [1, 2, 1] },
  walk: { group: "walk", frames: [0, 1, 2, 3, 0, 1, 2, 3] },
  curious: { group: "idle", frames: [0, 3, 3, 0] },
  touch: { group: "emotion", frames: [1, 0, 0] },
  support: { group: "idle", frames: [3, 0, 1, 0] },
  sleepy: { group: "emotion", frames: [2] },
  surprised: { group: "emotion", frames: [1] },
  dayComplete: { group: "emotion", frames: [0] },
  reward: { group: "emotion", frames: [1, 0, 0] },
  dress: { group: "idle", frames: [3, 0, 3, 0] },
  sad: { group: "emotion", frames: [3] },
};
