import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  registerNotificationTask,
  notificationOutcomeKey,
} from "./notificationTask";
import { readReminderJob, scheduleReminder } from "./notificationTransport";
export { readReminderJob, scheduleReminder } from "./notificationTransport";
import { instantNow } from "../core/calendar";
import {
  notificationSchedule,
  reconcileNotifications,
  type NotificationJob,
} from "../core/notifications";
import type { JourneyState } from "../core/journeyModel";
import { assignedTasks } from "../core/questionnaires";
import {
  prepareNotificationChannel,
  reminderChannel,
} from "./notificationPermissions";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
let queue: Promise<unknown> = Promise.resolve();
export async function configureNotifications() {
  await prepareNotificationChannel();
  await registerNotificationTask();
  await Notifications.setNotificationCategoryAsync("SYNCLIDOSE", [
    {
      identifier: "taken",
      buttonTitle: "Принял",
      options: { opensAppToForeground: Platform.OS !== "android" },
    },
    {
      identifier: "snooze",
      buttonTitle: "Через 15 минут",
      options: { opensAppToForeground: Platform.OS !== "android" },
    },
    {
      identifier: "open",
      buttonTitle: "Открыть план",
      options: { opensAppToForeground: true },
    },
  ]);
}
export function syncLocalNotifications(
  state: JourneyState,
  morning: string,
  reportTime: string,
  enabled: boolean,
  forceReschedule = false,
): Promise<number> {
  const operation = queue
    .catch(() => {})
    .then(async () => {
      await configureNotifications();
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const now = instantNow();
      const complete = (job: NotificationJob) => {
        const tasks = assignedTasks(state, job.day);
        return tasks.some(
          (t) =>
            t.completed &&
            (job.kind === "dose"
              ? t.kind === "dose" && t.slotId === job.slotId
              : job.kind === "report"
                ? t.kind === "report"
                : t.id === job.assignmentId),
        );
      };
      const current = scheduled
        .map((n) => readReminderJob(n.content.data))
        .filter((j): j is NotificationJob => !!j);
      const activeSnoozes = current.filter(
        (j) =>
          j.id.startsWith("syncli.snooze.") && j.at > now.utcMs && !complete(j),
      );
      const first = state.plan.medication.slots[0]?.id;
      const next = enabled
        ? [
            ...notificationSchedule(
              state.plan,
              { times: first ? { [first]: morning } : {}, reportTime },
              now,
            ).filter((j) => !complete(j)),
            ...activeSnoozes,
          ]
            .sort((a, b) => a.at - b.at)
            .slice(0, 60)
        : [];
      const delta = forceReschedule
        ? { cancel: current.map((j) => j.id), schedule: next }
        : reconcileNotifications(next, current);
      for (const old of scheduled)
        if (
          old.identifier.startsWith("syncli.") &&
          old.identifier !== "syncli.notification.probe" &&
          !readReminderJob(old.content.data)
        )
          delta.cancel.push(old.identifier);
      for (const id of delta.cancel)
        await Notifications.cancelScheduledNotificationAsync(id);
      for (const job of delta.schedule) await scheduleReminder(job);
      return next.length;
    });
  queue = operation;
  return operation;
}
export async function scheduleNotificationProbe() {
  await configureNotifications();
  await Notifications.dismissNotificationAsync("syncli.notification.probe");
  await Notifications.scheduleNotificationAsync({
    identifier: "syncli.notification.probe",
    content: {
      title: "Синкли",
      body: "Проверка напоминаний: всё на связи.",
      sound: "default",
      data: { syncliProbe: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: Date.now() + 15000,
      channelId: reminderChannel,
    },
  });
}
export async function clearReminderNotifications() {
  await queue.catch(() => {});
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled)
    if (request.identifier.startsWith("syncli."))
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
  const shown = await Notifications.getPresentedNotificationsAsync();
  for (const notification of shown)
    if (notification.request.identifier.startsWith("syncli."))
      await Notifications.dismissNotificationAsync(
        notification.request.identifier,
      );
  await Notifications.clearLastNotificationResponseAsync();
  await AsyncStorage.removeItem(notificationOutcomeKey);
}
