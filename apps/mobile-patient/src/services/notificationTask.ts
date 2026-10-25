import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter, Platform } from "react-native";
import { readReminderJob, scheduleReminder } from "./notificationTransport";
import { openPatientRepository } from "../storage/sqlite";
import {
  handleNotificationAction,
  notificationContentData,
} from "../core/notifications";
import { instantNow } from "../core/calendar";

export const notificationTaskName = "SYNCLI_REMINDER_ACTION";
export const notificationOutcomeKey = "syncli.notification.outcome";
export const notificationActionEvent = "syncliReminderActionSaved";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  notificationTaskName,
  async ({ data, error }) => {
    if (error) {
      await AsyncStorage.setItem(
        notificationOutcomeKey,
        JSON.stringify({ kind: "error" }),
      );
      return;
    }
    if (
      !("actionIdentifier" in data) ||
      !["taken", "snooze"].includes(data.actionIdentifier)
    )
      return;
    try {
      const job = readReminderJob(
        notificationContentData(data.notification.request.content),
      );
      if (!job) {
        await AsyncStorage.setItem(
          notificationOutcomeKey,
          JSON.stringify({ kind: "error" }),
        );
        return;
      }
      const result = await handleNotificationAction(
        { action: data.actionIdentifier === "taken" ? "taken" : "snooze", job },
        await openPatientRepository(),
        instantNow(),
      );
      if (result.kind === "snooze") await scheduleReminder(result.job);
      await AsyncStorage.setItem(
        notificationOutcomeKey,
        JSON.stringify({ kind: result.kind, at: Date.now() }),
      );
      await Notifications.dismissNotificationAsync(
        data.notification.request.identifier,
      ).catch(() => {});
      await Notifications.clearLastNotificationResponseAsync().catch(() => {});
      DeviceEventEmitter.emit(notificationActionEvent);
    } catch {
      await AsyncStorage.setItem(
        notificationOutcomeKey,
        JSON.stringify({ kind: "error" }),
      );
    }
  },
);
export async function registerNotificationTask() {
  if (
    Platform.OS === "android" &&
    !(await TaskManager.isTaskRegisteredAsync(notificationTaskName))
  )
    await Notifications.registerTaskAsync(notificationTaskName);
}
