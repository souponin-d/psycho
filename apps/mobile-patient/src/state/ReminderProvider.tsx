import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Alert, DeviceEventEmitter, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  notificationActionEvent,
  notificationOutcomeKey,
} from "../services/notificationTask";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useApp } from "./AppProvider";
import { useJourney } from "./JourneyProvider";
import {
  syncLocalNotifications,
  readReminderJob,
  scheduleReminder,
} from "../services/localNotifications";
import { canSchedulePrecisely } from "../services/exactAlarm";
import { openPatientRepository } from "../storage/sqlite";
import { handleNotificationAction } from "../core/notifications";
import { instantNow } from "../core/calendar";
import { usePatientConnection } from "./PatientConnectionProvider";

const Context = createContext<{
  allowed: boolean;
  precise: boolean | null;
  count: number;
  nextAt: number | null;
  error: string;
  refresh: () => void;
}>({
  allowed: false,
  precise: null,
  count: 0,
  nextAt: null,
  error: "",
  refresh: () => {},
});
export function ReminderProvider({ children }: PropsWithChildren) {
  const { state, isActive, today } = useApp();
  const { journey, ready, act } = useJourney();
  const { mode } = usePatientConnection();
  const [allowed, setAllowed] = useState(false),
    [precise, setPrecise] = useState<boolean | null>(null),
    [count, setCount] = useState(0),
    [error, setError] = useState("");
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const previousExact = useRef<boolean | null>(null);
  const processing = useRef(false);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(
      notificationActionEvent,
      () => {
        void act({ type: "tick" });
        refresh();
      },
    );
    return () => listener.remove();
  }, [act, refresh]);
  useEffect(() => {
    if (!isActive) return;
    void AsyncStorage.getItem(notificationOutcomeKey)
      .then(async (raw) => {
        if (!raw) return;
        const result = JSON.parse(raw) as { kind: string };
        if (result.kind === "error")
          Alert.alert(
            "Не удалось сохранить отметку",
            "Проверьте приём в плане. Действие из уведомления не подтверждено.",
          );
        else if (result.kind === "expired")
          Alert.alert(
            "Этот день уже завершён",
            "Запись можно исправить в истории. Прошлый стрик не пересчитывается.",
          );
        await AsyncStorage.removeItem(notificationOutcomeKey);
      })
      .catch(() =>
        setError("Не удалось прочитать результат действия из уведомления"),
      );
  }, [isActive, attempt]);
  useEffect(() => {
    if (!isActive || !ready || !journey) return;
    let alive = true;
    void (async () => {
      try {
        const permission = await Notifications.getPermissionsAsync();
        const exact = canSchedulePrecisely();
        const scheduled = await syncLocalNotifications(
          journey,
          state.morning,
          state.reportTime,
          permission.granted &&
            journey.connected &&
            state.onboarded &&
            mode === "demo",
          previousExact.current !== exact,
        );
        const actual = (await Notifications.getAllScheduledNotificationsAsync())
          .map((n) => readReminderJob(n.content.data))
          .filter((j) => j && j.at > Date.now())
          .sort((a, b) => a!.at - b!.at);
        previousExact.current = exact;
        if (alive) {
          setAllowed(permission.granted);
          setPrecise(exact);
          setCount(scheduled);
          setNextAt(actual[0]?.at ?? null);
          setError("");
        }
      } catch {
        if (alive)
          setError("Не удалось обновить напоминания. Повторите настройку.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    journey,
    isActive,
    ready,
    state.morning,
    state.reportTime,
    state.onboarded,
    today,
    attempt,
    mode,
  ]);
  useEffect(() => {
    if (!ready || !journey?.connected || !state.onboarded || mode !== "demo")
      return;
    const handle = async (response: Notifications.NotificationResponse) => {
      if (
        Platform.OS === "android" &&
        ["taken", "snooze"].includes(response.actionIdentifier)
      )
        return;
      if (processing.current) return;
      processing.current = true;
      try {
        const job = readReminderJob(response.notification.request.content.data);
        if (job) {
          const action =
            response.actionIdentifier === "taken"
              ? "taken"
              : response.actionIdentifier === "snooze"
                ? "snooze"
                : "open";
          const result = await handleNotificationAction(
            { action, job },
            await openPatientRepository(),
            instantNow(),
          );
          if (result.kind === "snooze") await scheduleReminder(result.job);
          await act({ type: "tick" });
          if (result.kind === "expired")
            router.push({
              pathname: "/(tabs)/history",
              params: { day: job.day },
            });
          else router.push("/(tabs)/plan");
          if (result.kind === "expired")
            Alert.alert(
              "Этот день уже завершён",
              "Можно исправить запись в истории. Стрик прошлого дня не пересчитывается.",
            );
          else if (result.kind === "saved")
            Alert.alert("Приём отмечен", "Отметка сохранена на этом телефоне.");
          else if (result.kind === "snooze")
            Alert.alert(
              "Напомним через 15 минут",
              "Назначенная схема остаётся прежней.",
            );
        } else router.push("/(tabs)/plan");
        await Notifications.clearLastNotificationResponseAsync();
        refresh();
      } catch {
        setError(
          "Не удалось обработать напоминание. Откройте план и проверьте отметку.",
        );
      } finally {
        processing.current = false;
      }
    };
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) void handle(response);
      })
      .catch(() => setError("Не удалось прочитать напоминание"));
    const listener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void handle(response);
      },
    );
    return () => listener.remove();
  }, [ready, journey?.connected, state.onboarded, act, refresh, mode]);
  return (
    <Context.Provider
      value={{ allowed, precise, count, nextAt, error, refresh }}
    >
      {children}
    </Context.Provider>
  );
}
export function useReminders() {
  return useContext(Context);
}
