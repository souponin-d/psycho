import { useState } from "react";
import { patientLabel } from "../../core/patientPresentation";
import { Alert, View } from "react-native";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { Screen, Heading, T, Button } from "../../components/UI";
import { Touch } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import { useApp } from "../../state/AppProvider";
import { useJourney } from "../../state/JourneyProvider";
import {
  assignedTasks,
  latestDose,
  latestReports,
} from "../../core/questionnaires";
import { dayAt, instantNow, journeyProgress } from "../../core/calendar";
import { handleNotificationAction } from "../../core/notifications";
import { openPatientRepository } from "../../storage/sqlite";
import { scheduleReminder } from "../../services/notificationTransport";
export default function PlanScreen() {
  const { theme, today, state } = useApp();
  const { journey, act, saving } = useJourney();
  const [reminding, setReminding] = useState(false);
  const [showPrescription, setShowPrescription] = useState(false);
  if (!journey) return null;
  const tasks = assignedTasks(journey, today),
    progress = journeyProgress(journey, today);
  async function dose(slotId: string, status: "taken" | "missed" | "unknown") {
    if (dayAt(instantNow()) !== today) {
      Alert.alert(
        "Начался новый день",
        "Откройте сегодняшний план и проверьте отметку.",
      );
      return;
    }
    await act({
      type: "event",
      event: {
        id: "dose-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        kind: "dose",
        action: "select",
        day: today,
        slotId,
        status,
        occurredAt:
          status === "taken"
            ? new Date().toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : undefined,
      },
    });
  }
  const report = latestReports(journey, today).find((r) => r.required);
  async function remind(slotId: string) {
    if (!journey) return;
    setReminding(true);
    try {
      if (!(await Notifications.getPermissionsAsync()).granted) {
        Alert.alert(
          "Разрешите уведомления",
          "Это можно сделать в настройках Синкли.",
          [
            { text: "Позже" },
            { text: "Настройки", onPress: () => router.push("/settings") },
          ],
        );
        return;
      }
      const now = instantNow();
      const result = await handleNotificationAction(
        {
          action: "snooze",
          job: {
            id: `syncli.snooze.${journey.plan.id}.${today}.${slotId}`,
            planId: journey.plan.id,
            day: today,
            at: now.utcMs,
            kind: "dose",
            slotId,
          },
        },
        await openPatientRepository(),
        now,
      );
      if (result.kind === "snooze") {
        await scheduleReminder(result.job);
        Alert.alert(
          "Напоминание добавлено",
          "Через 15 минут придёт уведомление. Схема приёма не изменена.",
        );
      } else if (result.kind === "expired")
        Alert.alert(
          "День заканчивается",
          "Напоминание не переносится на следующий день. План остаётся прежним.",
        );
      else Alert.alert("Приём уже отмечен", "Проверьте запись в плане.");
    } catch {
      Alert.alert(
        "Не удалось добавить напоминание",
        "Попробуйте ещё раз в настройках уведомлений.",
      );
    } finally {
      setReminding(false);
    }
  }
  return (
    <Screen title="Синкли">
      <Heading
        title="Мой план"
        body={
          new Date(today + "T12:00:00").toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
          }) + " · шаг за шагом"
        }
      />
      <T size={19} weight="500">
        На сегодня · {tasks.filter((t) => t.completed).length} из {tasks.length}
      </T>
      <View style={{ gap: 12, marginTop: 14, marginBottom: 14 }}>
        {journey.plan.medication.slots.map((slot) => {
          const current = latestDose(journey, today, slot.id);
          return (
            <View
              key={slot.id}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 24,
                padding: 16,
                gap: 8,
              }}
            >
              <View
                style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <Icon name="pill" color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <T size={19} weight="500">
                    {slot.label}
                  </T>
                  <T size={14} weight="600">
                    {journey.plan.medication.name}
                  </T>
                  <T size={12} muted>
                    {patientLabel(
                      journey.plan.medication.dosageLabel,
                      "Дозировка не указана",
                    )}
                  </T>
                  <T size={12} muted>
                    Напоминание:{" "}
                    {slot.id === journey.plan.medication.slots[0]?.id
                      ? state.morning
                      : slot.time}
                  </T>
                  <T muted size={12}>
                    {current?.status === "taken"
                      ? "Отмечено: принят"
                      : current?.status === "missed"
                        ? "Отмечено: пропущен"
                        : "Приём ещё не отмечен"}
                  </T>
                </View>
              </View>
              {current?.status === "taken" && current.occurredAt && (
                <T size={12} muted>
                  Фактическая отметка: {current.occurredAt}
                </T>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(
                  [
                    ["taken", "Принял"],
                    ["missed", "Пропустил"],
                  ] as const
                ).map(([status, label]) => (
                  <Touch
                    key={status}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{
                      selected: current?.status === status,
                      disabled: saving,
                    }}
                    onPress={() => void dose(slot.id, status)}
                    style={{
                      minWidth: 110,
                      padding: 12,
                      minHeight: 52,
                      borderRadius: 17,
                      backgroundColor:
                        current?.status === status ? theme.accent : theme.soft,
                      alignItems: "center",
                    }}
                  >
                    <T
                      size={14}
                      weight="500"
                      style={{
                        color:
                          current?.status === status
                            ? theme.onAccent
                            : theme.text,
                      }}
                    >
                      {label}
                    </T>
                  </Touch>
                ))}
              </View>
              {(!current || current.status === "unknown") && (
                <Button
                  title="Напомнить через 15 минут"
                  secondary
                  disabled={reminding || saving}
                  onPress={() => void remind(slot.id)}
                />
              )}
              {current && current.status !== "unknown" && (
                <Touch
                  accessibilityRole="button"
                  onPress={() => void dose(slot.id, "unknown")}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 8,
                    justifyContent: "center",
                  }}
                >
                  <T muted size={12}>
                    Убрать ошибочную отметку
                  </T>
                </Touch>
              )}
            </View>
          );
        })}
      </View>
      <View style={{ gap: 12 }}>
        <Button
          title={report ? "Изменить самоотчёт" : "Заполнить самоотчёт"}
          icon="heart"
          onPress={() =>
            router.push({
              pathname: "/check-in",
              params: {
                day: today,
                ...(report ? { reportId: report.entityId ?? report.id } : {}),
              },
            })
          }
        />
        {tasks
          .filter((t) => t.kind === "questionnaire")
          .map((task) => (
            <Button
              key={task.id}
              title={
                task.completed
                  ? "Назначенный опрос · завершён"
                  : "Пройти назначенный опрос"
              }
              secondary
              disabled={task.completed}
              onPress={() =>
                router.push({
                  pathname: "/questionnaire",
                  params: { id: task.id },
                } as Href)
              }
            />
          ))}
      </View>
      <T muted size={12} style={{ marginTop: 17, marginBottom: 25 }}>
        {!state.gameplay
          ? "Отмечайте назначения и сохраняйте записи в удобном ритме. Все сведения доступны в истории."
          : progress.today.complete
            ? "На сегодня всё выполнено. Итог дня закрепится в 00:00."
            : "Для зачёта дня нужны все приёмы, полный самоотчёт и назначенные на сегодня тесты. День заканчивается в 00:00."}
      </T>
      <View style={{ gap: 12, marginBottom: 22 }}>
        <Button
          title={
            showPrescription
              ? "Скрыть назначение"
              : "Назначение и схема терапии"
          }
          secondary
          onPress={() => setShowPrescription(!showPrescription)}
        />
        {showPrescription && (
          <>
            {" "}
            <View
              style={{
                backgroundColor: theme.soft,
                borderRadius: 28,
                padding: 22,
                gap: 9,
                marginBottom: 24,
              }}
            >
              <T size={12} muted>
                Ваше назначение
              </T>
              {journey.plan.effectiveFrom && journey.planVersions && (
                <T size={12} muted>
                  План уточнён с{" "}
                  {new Date(
                    journey.plan.effectiveFrom + "T12:00:00",
                  ).toLocaleDateString("ru-RU")}
                  . Разделы самоотчёта определены врачом.
                </T>
              )}
              <T size={28} weight="500">
                {journey.plan.medication.name}
              </T>
              <T size={13}>
                {patientLabel(
                  journey.plan.medication.dosageLabel,
                  "Дозировка не указана",
                )}
              </T>
              <T muted size={11}>
                Назначение врача · {patientLabel(journey.plan.doctor)}
              </T>
            </View>
          </>
        )}
      </View>
      <View style={{ gap: 12 }}>
        <Button
          title="Переносимость и обращение"
          secondary
          onPress={() => router.push("/contact" as Href)}
        />
        <Button
          title="Следующий приём и вопросы"
          secondary
          icon="calendar"
          onPress={() => router.push("/visit" as Href)}
        />
      </View>
    </Screen>
  );
}
