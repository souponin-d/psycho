import type { JourneyState } from "./journeyModel.ts";
import { assignedTasks, type AssignedTask } from "./questionnaires.ts";
import { assessDay, planForDay } from "./therapy.ts";
export function dayNode(state: JourneyState, day: string, today: string) {
  const future = day > today,
    closed = state.closedDays[day];
  const tasks = assignedTasks(state, day).map((t) => ({
    ...t,
    completed: !future && t.completed,
  }));
  const assessment =
    closed ?? assessDay(planForDay(state, day), state.events, day);
  const awarded = !future && assessment.complete;
  const done = tasks.filter((t) => t.completed).length;
  const groups = (["dose", "report", "questionnaire"] as const).flatMap(
    (kind) => {
      const entries = tasks.filter((t) => t.kind === kind);
      return entries.length
        ? [
            {
              kind,
              total: entries.length,
              done: entries.filter((t) => t.completed).length,
              complete: entries.every((t) => t.completed),
            },
          ]
        : [];
    },
  );
  const status = future
    ? ("future" as const)
    : day === today
      ? ("today" as const)
      : awarded
        ? ("complete" as const)
        : ("missed" as const);
  const growth = awarded
    ? 3
    : future
      ? 0
      : Math.min(2, Math.floor((done / Math.max(1, tasks.length)) * 3));
  return {
    day,
    status,
    tasks,
    groups,
    done,
    total: tasks.length,
    awarded,
    growth,
    closed: !!closed || day < today,
    nextTask:
      day === today && !closed
        ? (tasks.find((t) => !t.completed) ?? null)
        : (null as AssignedTask | null),
  };
}
