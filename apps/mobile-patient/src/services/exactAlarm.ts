import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

const alarm = requireOptionalNativeModule<{
  canScheduleExactAlarms(): boolean;
  requestExactAlarmAccess(): Promise<void>;
}>("SyncliAlarm");
export function canSchedulePrecisely(): boolean | null {
  if (Platform.OS !== "android") return true;
  return alarm?.canScheduleExactAlarms() ?? null;
}
export async function requestExactAlarmAccess() {
  if (alarm) await alarm.requestExactAlarmAccess();
  else
    throw new Error(
      "Установите обновлённую Android-сборку для настройки точного времени",
    );
}
