import { View } from "react-native";
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
export default function PlanScreen() {
  const { theme, today } = useApp();
  const { journey, act, saving } = useJourney();
  if (!journey) return null;
  const tasks = assignedTasks(journey, today),
    progress = journeyProgress(journey, today);
  async function dose(slotId: string, status: "taken" | "missed" | "unknown") {
    await act({
      type: "event",
      event: {
        id: "dose-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        kind: "dose",
        day: dayAt(instantNow()),
        slotId,
        status,
        occurredAt: new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    });
  }
  const report = latestReports(journey, today).find((r) => r.required);
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
        <T size={28} weight="500">
          {journey.plan.medication.name}
        </T>
        <T size={13}>{journey.plan.medication.dosageLabel}</T>
        <T muted size={11}>
          Из подключённого учебного плана · {journey.plan.doctor}
        </T>
      </View>
      <T size={19} weight="500">
        На сегодня · {tasks.filter((t) => t.completed).length} из {tasks.length}
      </T>
      <View style={{ gap: 20, marginTop: 18, marginBottom: 24 }}>
        {journey.plan.medication.slots.map((slot) => {
          const current = latestDose(journey, today, slot.id);
          return (
            <View
              key={slot.id}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 24,
                padding: 20,
                gap: 12,
              }}
            >
              <View
                style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <Icon name="pill" color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <T size={19} weight="500">
                    {slot.label} · {slot.time}
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
                      flex: 1,
                      padding: 15,
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
              {current && current.status !== "unknown" && (
                <Touch
                  accessibilityRole="button"
                  onPress={() => void dose(slot.id, "unknown")}
                  style={{ padding: 7 }}
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
          title={report ? "Изменить самоотчёт" : "Как вы сейчас?"}
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
        {progress.today.complete
          ? "На сегодня всё выполнено. Итог дня закрепится в 00:00."
          : "Для зачёта дня нужны все приёмы, полный самоотчёт и назначенные на сегодня тесты. День заканчивается в 00:00."}
      </T>
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
