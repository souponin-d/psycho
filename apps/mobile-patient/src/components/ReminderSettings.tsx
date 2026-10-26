import { TimeControl } from "./TimeControl";
import { useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import { useApp } from "../state/AppProvider";
import { useReminders } from "../state/ReminderProvider";
import { requestReminderPermission } from "../services/notificationPermissions";
import { requestExactAlarmAccess } from "../services/exactAlarm";
import { scheduleNotificationProbe } from "../services/localNotifications";
import { T, Panel, Button } from "./UI";

export function ReminderSettings() {
  const { state, dispatch, theme, preferencesSaving, storageError } = useApp();
  const reminders = useReminders();
  const [morning, setMorning] = useState(state.morning),
    [report, setReport] = useState(state.reportTime);
  const [busy, setBusy] = useState(false);
  const valid = [morning, report].every((v) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  );
  const action = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      reminders.refresh();
    } catch (e) {
      Alert.alert(
        "Напоминания",
        e instanceof Error
          ? e.message
          : "Не удалось выполнить действие. Попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel style={{ gap: 16, marginTop: 24 }}>
      <T size={18} weight="600">
        Напоминания
      </T>
      {reminders.nextAt && (
        <T size={14}>
          Ближайшее напоминание:{" "}
          {new Date(reminders.nextAt).toLocaleString("ru-RU", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </T>
      )}
      <T size={13} muted>
        Схему задаёт врач. Вы можете выбрать удобные часы, сохраняя количество
        приёмов.
      </T>
      {(
        [
          ["Время приёма препарата", morning, setMorning],
          ["Время самоотчёта", report, setReport],
        ] as const
      ).map(([label, value, onChangeText]) => (
        <TimeControl
          key={label}
          label={label}
          value={value}
          onChange={onChangeText}
        />
      ))}
      {!valid && <T size={12}>Введите часы и минуты в формате 07:45.</T>}
      <Button
        title="Сохранить время"
        disabled={!valid || busy}
        onPress={() => {
          dispatch({
            type: "preferences",
            patch: { morning, reportTime: report },
          });
        }}
      />
      <T size={12} muted accessibilityLiveRegion="polite">
        {storageError
          ? "Не удалось сохранить время"
          : preferencesSaving
            ? "Сохраняем время…"
            : morning === state.morning && report === state.reportTime
              ? "Время сохранено"
              : "Есть несохранённые изменения"}
      </T>
      <T size={13} weight="600">
        {reminders.allowed ? "Уведомления разрешены" : "Уведомления выключены"}
      </T>
      {reminders.allowed && (
        <T size={12} muted>
          {reminders.precise === true
            ? "Точное время разрешено."
            : reminders.precise === false
              ? "Android пока может задерживать сигнал. Разрешите точное время ниже."
              : "Точность расписания не удалось проверить."}{" "}
          В расписании: {reminders.count}.
        </T>
      )}
      {!!reminders.error && (
        <T accessibilityRole="alert" size={13}>
          {reminders.error}
        </T>
      )}
      {!reminders.allowed && (
        <Button
          title="Разрешить уведомления"
          secondary
          disabled={busy}
          onPress={() =>
            void action(async () => {
              const granted = await requestReminderPermission();
              if (!granted)
                Alert.alert(
                  "Уведомления выключены",
                  "Их можно разрешить позже кнопкой «Настройки уведомлений телефона».",
                );
            })
          }
        />
      )}
      {Platform.OS === "android" && reminders.precise !== true && (
        <Button
          title="Настроить точное время"
          secondary
          disabled={busy}
          onPress={() => void action(requestExactAlarmAccess)}
        />
      )}
      <Button
        title="Проверить уведомление через 15 секунд"
        secondary
        disabled={busy || !reminders.allowed}
        onPress={() =>
          void action(async () => {
            await scheduleNotificationProbe();
            Alert.alert(
              "Проверка назначена",
              "Сверните приложение. Через 15 секунд появится уведомление Синкли.",
            );
          })
        }
      />
      <Button
        title="Настройки уведомлений телефона"
        secondary
        onPress={() => void Linking.openSettings()}
      />
      <T size={11} muted>
        Напоминания на ближайшие 4 недели хранятся в телефоне и работают при
        закрытом приложении. Расписание обновляется при открытии Синкли. После
        принудительной остановки через настройки Android откройте Синкли снова.
      </T>
    </Panel>
  );
}
