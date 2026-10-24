import * as Notifications from "expo-notifications";
import type { NotificationJob } from "../core/notifications";
import { reminderChannel } from "./notificationPermissions";

export function readReminderJob(
  data: Record<string, unknown> | undefined,
): NotificationJob | null {
  const job = data?.job as NotificationJob | undefined;
  if (
    !data?.syncliReminder ||
    !job ||
    typeof job.id !== "string" ||
    typeof job.planId !== "string" ||
    !job.id.startsWith("syncli.") ||
    typeof job.day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(job.day) ||
    !Number.isFinite(job.at) ||
    !["dose", "report", "test"].includes(job.kind)
  )
    return null;
  return job;
}
export async function scheduleReminder(job: NotificationJob) {
  await Notifications.scheduleNotificationAsync({
    identifier: job.id,
    content: {
      title: "Синкли",
      body:
        job.kind === "dose"
          ? "Время заглянуть в ваш план."
          : job.kind === "test"
            ? "Сегодня вас ждёт назначенный опрос."
            : "Найдите минуту для записи о самочувствии.",
      data: { syncliReminder: true, job },
      categoryIdentifier: job.kind === "dose" ? "SYNCLIDOSE" : undefined,
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: job.at,
      channelId: reminderChannel,
    },
  });
}
