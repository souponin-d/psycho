import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export const reminderChannel = "syncli_reminders";
export async function prepareNotificationChannel() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(reminderChannel, {
      name: "Напоминания о плане",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 60],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: "default",
    });
}
export async function requestReminderPermission() {
  await prepareNotificationChannel();
  const permission = await Notifications.requestPermissionsAsync();
  return permission.granted;
}
