import { chapterRewardItem } from "./weeklyReward.ts";
import type { JourneyState } from "./journeyModel.ts";
import {
  achievementCatalog,
  type AchievementMetric,
} from "../config/worldCatalog.ts";
import { fieldComplete, planForDay } from "./therapy.ts";

export function achievementProgress(state: JourneyState) {
  const days = Object.values(state.closedDays).sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  let streak = 0,
    best = 0,
    previous = -Infinity;
  for (const day of days) {
    const date = Date.parse(day.day + "T12:00:00Z");
    streak = day.complete ? (date - previous === 86400000 ? streak + 1 : 1) : 0;
    best = Math.max(best, streak);
    previous = date;
  }
  const reports = new Map<string, (typeof state.events)[number]>();
  for (const e of [...state.events].sort((a, b) => a.at - b.at))
    if (
      e.kind === "report" &&
      e.required &&
      e.day === e.recordedDay &&
      e.gameEligible !== false
    )
      reports.set(e.day, e);
  const tests = new Set(
    state.events
      .filter(
        (e) =>
          e.kind === "questionnaire" &&
          e.gameEligible !== false &&
          e.day === e.recordedDay &&
          state.plan.tests.some(
            (t) =>
              t.id === e.assignmentId &&
              t.day === e.day &&
              t.formId === e.formId &&
              t.questionCount === e.answers.length,
          ) &&
          e.answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3),
      )
      .map((e) => (e.kind === "questionnaire" ? e.assignmentId : "")),
  );
  const metrics: Record<AchievementMetric, number> = {
    days: days.filter((d) => d.complete).length,
    streak: best,
    reports: [...reports.values()].filter(
      (e) =>
        e.kind === "report" &&
        !e.deleted &&
        planForDay(state, e.day).reportFields.every((f) =>
          fieldComplete(e.fields, f),
        ),
    ).length,
    tests: tests.size,
    placed: state.activity?.customized ? 1 : 0,
    history: state.activity?.history ? 1 : 0,
    question: state.activity?.question ? 1 : 0,
    calendar: Math.max(
      0,
      Math.floor(
        (Date.parse(state.lastObservedDay + "T12:00:00Z") -
          Date.parse(state.plan.startedAt + "T12:00:00Z")) /
          86400000,
      ),
    ),
  };
  return achievementCatalog.map((a) => ({
    ...a,
    value: metrics[a.metric],
    unlocked:
      state.rewards.some((r) => r.id === "achievement:" + a.id) ||
      metrics[a.metric] >= a.target,
  }));
}

export function grantRewards(state: JourneyState): JourneyState {
  const chapters = new Map<number, string[]>();
  const start = Date.parse(state.plan.startedAt + "T12:00:00Z");
  for (const day of Object.values(state.closedDays)
    .filter((d) => d.complete)
    .sort((a, b) => a.day.localeCompare(b.day))) {
    const index = Math.floor(
      (Date.parse(day.day + "T12:00:00Z") - start) / 604800000,
    );
    if (index < 0) continue;
    chapters.set(index, [...(chapters.get(index) ?? []), day.day]);
  }
  const rewards = [...state.rewards];
  for (const [index, days] of chapters) {
    const id = "chapter-" + index;
    if (days.length >= 5 && !rewards.some((r) => r.id === id))
      rewards.push({
        id,
        itemId: chapterRewardItem(index),
        day: days[4]!,
      });
  }
  for (const a of achievementProgress(state))
    if (a.unlocked && !rewards.some((r) => r.id === "achievement:" + a.id))
      rewards.push({
        id: "achievement:" + a.id,
        itemId: a.itemId,
        day: state.lastObservedDay,
      });
  return rewards.length === state.rewards.length
    ? state
    : { ...state, rewards };
}
