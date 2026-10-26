import { dayAt, shiftDay } from "./calendar.ts";
import type { Instant, PlanVersion } from "./journeyModel.ts";
import type { PatientRepository } from "../storage/database.ts";
import { latestDose } from "./questionnaires.ts";
import { PatientValidationError } from "./patientErrors.ts";

export type ReminderPreferences = {
  times: Record<string, string>;
  reportTime: string;
};
export type NotificationJob = {
  id: string;
  planId: string;
  day: string;
  at: number;
  kind: "dose" | "report" | "test";
  slotId?: string;
  assignmentId?: string;
};
export type NotificationAction = {
  action: "taken" | "snooze" | "open";
  job: NotificationJob;
};
export function notificationContentData(content: {
  data?: unknown;
  dataString?: unknown;
}): Record<string, unknown> | undefined {
  if (
    content.data &&
    typeof content.data === "object" &&
    !Array.isArray(content.data)
  )
    return content.data as Record<string, unknown>;
  if (typeof content.dataString === "string") {
    try {
      const parsed: unknown = JSON.parse(content.dataString);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      /* Corrupt or foreign notification payload is never an action. */
    }
  }
  return undefined;
}
function localInstant(day: string, time: string, now: Instant) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new PatientValidationError("Проверьте время напоминания");
  const target = Date.parse(`${day}T${time}:00Z`);
  let candidate = target - now.offsetMinutes * 60000;
  try {
    const format = new Intl.DateTimeFormat("en-CA", {
      timeZone: now.zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const seen = new Set<number>();
    for (let i = 0; i < 3; i++) {
      const p = Object.fromEntries(
        format.formatToParts(candidate).map((v) => [v.type, v.value]),
      );
      const observed = Date.parse(
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
      );
      const difference = target - observed;
      if (!difference) break;
      seen.add(candidate);
      if (seen.has(candidate + difference))
        return Math.max(candidate, candidate + difference);
      candidate += difference;
    }
  } catch {
    /* Fixed-offset fallback for devices without IANA zone support. */
  }
  return candidate;
}
export function notificationSchedule(
  plan: PlanVersion,
  preferences: ReminderPreferences,
  now: Instant,
): NotificationJob[] {
  if (plan.status === "unavailable") return [];
  const jobs: NotificationJob[] = [];
  const today = dayAt(now);
  for (let i = 0; i < 28; i++) {
    const day = shiftDay(today, i);
    if (day < plan.startedAt) continue;
    for (const slot of plan.medication.slots)
      jobs.push({
        id: `syncli.dose.${plan.id}.${day}.${slot.id}`,
        planId: plan.id,
        day,
        kind: "dose",
        slotId: slot.id,
        at: localInstant(day, preferences.times[slot.id] ?? slot.time, now),
      });
    jobs.push({
      id: `syncli.report.${plan.id}.${day}`,
      planId: plan.id,
      day,
      kind: "report",
      at: localInstant(day, preferences.reportTime, now),
    });
    for (const test of plan.tests.filter((t) => t.day === day))
      jobs.push({
        id: `syncli.test.${plan.id}.${test.id}`,
        planId: plan.id,
        day,
        kind: "test",
        assignmentId: test.id,
        at: localInstant(day, "19:00", now),
      });
  }
  return jobs.filter((j) => j.at > now.utcMs).sort((a, b) => a.at - b.at);
}
export function reconcileNotifications(
  next: NotificationJob[],
  current: NotificationJob[],
) {
  const nextMap = new Map(next.map((job) => [job.id, job]));
  const currentMap = new Map(current.map((job) => [job.id, job]));
  return {
    cancel: current
      .filter(
        (old) => !nextMap.has(old.id) || nextMap.get(old.id)!.at !== old.at,
      )
      .map((job) => job.id),
    schedule: next.filter(
      (job) => !currentMap.has(job.id) || currentMap.get(job.id)!.at !== job.at,
    ),
  };
}
export async function handleNotificationAction(
  { action, job }: NotificationAction,
  repository: PatientRepository,
  now: Instant,
): Promise<
  | { kind: "saved" | "expired" | "open" | "ignored" }
  | { kind: "snooze"; job: NotificationJob }
> {
  const today = dayAt(now);
  const state = await repository.load();
  if (
    job.day !== today ||
    state.closedDays[today] ||
    job.planId !== state.plan.id
  )
    return { kind: "expired" };
  if (job.kind !== "dose" || action === "open") return { kind: "open" };
  if (!state.plan.medication.slots.some((s) => s.id === job.slotId))
    return { kind: "expired" };
  if (latestDose(state, today, job.slotId!)?.status === "taken")
    return { kind: "ignored" };
  if (action === "snooze") {
    const at = now.utcMs + 15 * 60000;
    if (dayAt({ ...now, utcMs: at }) !== today) return { kind: "expired" };
    return {
      kind: "snooze",
      job: {
        ...job,
        id: `syncli.snooze.${job.planId}.${job.day}.${job.slotId}`,
        at,
      },
    };
  }
  await repository.apply(
    {
      type: "event",
      event: {
        id: "notification:" + job.id,
        day: job.day,
        kind: "dose",
        slotId: job.slotId!,
        status: "taken",
        source: "notification",
      },
    },
    now,
  );
  return { kind: "saved" };
}
