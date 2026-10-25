import type { CompanionMode } from "./companion.ts";
export type CompanionFrame = {
  group: "idle" | "walk" | "emotion";
  index: number;
};
export type CompanionFrameStep = CompanionFrame & {
  holdMs: number;
  blendMs: number;
};
const frame = (
  group: CompanionFrame["group"],
  index: number,
  holdMs: number,
  blendMs = 160,
): CompanionFrameStep => ({ group, index, holdMs, blendMs });
const rest = () => frame("idle", 0, 400, 180);
export function companionTimeline(mode: CompanionMode): {
  steps: CompanionFrameStep[];
  loop: boolean;
} {
  switch (mode) {
    case "idle":
      return {
        loop: true,
        steps: [
          frame("idle", 0, 3600, 120),
          frame("idle", 1, 80, 40),
          frame("idle", 2, 75, 35),
          frame("idle", 1, 80, 40),
          frame("idle", 0, 2100, 80),
          frame("idle", 3, 500, 180),
          frame("idle", 0, 1200, 180),
        ],
      };
    case "walk":
      return {
        loop: true,
        steps: [0, 1, 2, 3].map((i) => frame("walk", i, 180, 100)),
      };
    case "blink":
      return {
        loop: false,
        steps: [
          frame("idle", 1, 80, 40),
          frame("idle", 2, 70, 30),
          frame("idle", 1, 80, 40),
          frame("idle", 0, 280, 60),
        ],
      };
    case "touch":
      return {
        loop: false,
        steps: [
          frame("idle", 3, 260, 140),
          frame("emotion", 0, 680, 180),
          rest(),
        ],
      };
    case "curious":
      return { loop: false, steps: [frame("idle", 3, 950, 200), rest()] };
    case "support":
      return { loop: false, steps: [frame("idle", 3, 900, 220), rest()] };
    case "sleepy":
      return { loop: false, steps: [frame("emotion", 2, 1800, 250), rest()] };
    case "surprised":
      return { loop: false, steps: [frame("emotion", 1, 650, 200), rest()] };
    case "dayComplete":
      return { loop: false, steps: [frame("emotion", 0, 900, 220), rest()] };
    case "reward":
      return {
        loop: false,
        steps: [
          frame("emotion", 1, 450, 180),
          frame("emotion", 0, 900, 180),
          rest(),
        ],
      };
    case "dress":
      return {
        loop: false,
        steps: [frame("idle", 3, 300, 150), frame("idle", 0, 300, 150)],
      };
    case "sad":
      return { loop: false, steps: [frame("emotion", 3, 800, 220), rest()] };
  }
}
export const companionTimelineDuration = (mode: CompanionMode) =>
  companionTimeline(mode).steps.reduce((n, s) => n + s.holdMs, 0);
