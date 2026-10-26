import { useState } from "react";
import { Alert, View } from "react-native";
import { router, type Href } from "expo-router";
import { Screen, Heading, T, Button } from "./UI";
import { Touch } from "./Motion";
import { Icon } from "./Icon";
import { useApp } from "../state/AppProvider";
import { usePatientConnection } from "../state/PatientConnectionProvider";
import {
  doseSlotsForLocalDay,
  localDayBounds,
  type PatientDoseSlot,
} from "../core/patientDoseSchedule";

export function ServerTreatmentPlan() {
  const { theme, today } = useApp();
  const connection = usePatientConnection();
  const [saving, setSaving] = useState(false);
  const data = connection.snapshot?.doses;
  const bounds = localDayBounds(today);
  const slots =
    data?.kind === "ready" && bounds
      ? doseSlotsForLocalDay(data, today, bounds.start, bounds.end, Date.now())
      : [];
  const plan = connection.snapshot?.plan;
  async function mark(
    slot: PatientDoseSlot,
    status: "taken" | "missed" | "unknown",
  ) {
    setSaving(true);
    try {
      await connection.markDose(
        {
          scheduleId: slot.scheduleId,
          scheduleVersion: slot.scheduleVersion,
          plannedAt: slot.plannedAt,
          status,
          reportedAt: new Date().toISOString(),
          expectedVersion: slot.recordVersion,
          reason: slot.recordVersion ? "Исправлено пациентом" : "",
        },
        `dose-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    } catch (e) {
      Alert.alert(
        "Отметка",
        e instanceof Error ? e.message : "Не удалось отправить отметку",
      );
    } finally {
      setSaving(false);
    }
  }
  function choose(
    slot: PatientDoseSlot,
    status: "taken" | "missed" | "unknown",
  ) {
    if (!slot.recordVersion) return void mark(slot, status);
    if (slot.status === status) return;
    Alert.alert(
      "Изменить отметку?",
      "Предыдущая отметка останется в истории.",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Изменить", onPress: () => void mark(slot, status) },
      ],
    );
  }
  return (
    <Screen title="Синкли">
      <Heading
        title="Мой план"
        body={new Date(today + "T12:00:00").toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
        })}
      />
      <T size={19} weight="500">
        На сегодня
      </T>
      <View style={{ gap: 12, marginTop: 14, marginBottom: 14 }}>
        {!connection.connected ? (
          <T muted>Подключитесь к серверу, чтобы увидеть назначения врача.</T>
        ) : data?.kind !== "ready" ? (
          <T muted>Расписание пока недоступно.</T>
        ) : !slots.length ? (
          <T muted>На сегодня нет приёмов с указанным временем.</T>
        ) : (
          slots.map((slot) => {
            const pending = connection.pendingDoses.find((item) => {
              const value = item.mutation.value as
                | {
                    scheduleId?: string;
                    scheduleVersion?: number;
                    plannedAt?: string;
                  }
                | undefined;
              return (
                value?.scheduleId === slot.scheduleId &&
                value.scheduleVersion === slot.scheduleVersion &&
                value.plannedAt === slot.plannedAt
              );
            });
            return (
              <View
                key={`${slot.scheduleId}-${slot.scheduleVersion}-${slot.plannedAt}`}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 24,
                  padding: 16,
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <Icon name="pill" color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <T size={19} weight="500">
                      {new Date(slot.plannedAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </T>
                    <T size={12} muted>
                      Время телефона
                    </T>
                    <T size={14} weight="600">
                      {slot.title}
                    </T>
                    <T size={12} muted>
                      {slot.dose}
                    </T>
                    <T size={12} muted>
                      {pending
                        ? "Отметка ожидает отправки"
                        : slot.status === "taken"
                          ? "Отмечено: принят"
                          : slot.status === "missed"
                            ? "Отмечено: пропущен"
                            : slot.available
                              ? "Приём ещё не отмечен"
                              : "Время приёма ещё не наступило"}
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
                      disabled={saving || !slot.available || !!pending}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{
                        selected: slot.status === status,
                        disabled: saving || !slot.available || !!pending,
                      }}
                      onPress={() => choose(slot, status)}
                      style={{
                        minWidth: 110,
                        padding: 12,
                        minHeight: 52,
                        borderRadius: 17,
                        backgroundColor:
                          slot.status === status ? theme.accent : theme.soft,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity:
                          saving || !slot.available || !!pending ? 0.5 : 1,
                      }}
                    >
                      <T
                        size={14}
                        weight="500"
                        style={{
                          color:
                            slot.status === status
                              ? theme.onAccent
                              : theme.text,
                        }}
                      >
                        {label}
                      </T>
                    </Touch>
                  ))}
                </View>
                {slot.recordVersion > 0 &&
                  slot.status !== "unknown" &&
                  !pending && (
                    <Touch
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={() => choose(slot, "unknown")}
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
                {pending &&
                  connection.pendingDoses[0]?.commandId === pending.commandId &&
                  connection.doseError.startsWith("Отметка не принята") && (
                    <Button
                      title="Удалить отклонённую отметку"
                      secondary
                      onPress={() =>
                        Alert.alert(
                          "Удалить отметку?",
                          "Сервер не принял эту отметку.",
                          [
                            { text: "Отмена", style: "cancel" },
                            {
                              text: "Удалить",
                              style: "destructive",
                              onPress: () =>
                                void connection.cancelPendingDose(
                                  pending.commandId,
                                ),
                            },
                          ],
                        )
                      }
                    />
                  )}
              </View>
            );
          })
        )}
        {!!connection.doseError && (
          <T muted size={12}>
            {connection.doseError}
          </T>
        )}
      </View>
      <View style={{ gap: 12, marginBottom: 22 }}>
        <Button
          title="Заполнить самоотчёт"
          icon="heart"
          disabled={!connection.connected}
          onPress={() =>
            router.push({ pathname: "/check-in", params: { day: today } })
          }
        />
        {connection.snapshot?.questionnaires.kind === "ready" &&
          connection.snapshot.questionnaires.items
            .filter((item) => item.status === "issued")
            .map((item) => {
              const pending = connection.pendingQuestionnaires.some(
                (entry) =>
                  (
                    entry.mutation.value as
                      { assignmentId?: string } | undefined
                  )?.assignmentId === item.id,
              );
              return (
                <Button
                  key={item.id}
                  title={
                    pending
                      ? "Ответы опроса ожидают отправки"
                      : `Пройти назначенный опрос · ${item.formId.toUpperCase()}`
                  }
                  secondary
                  disabled={pending || !connection.connected}
                  onPress={() =>
                    router.push({
                      pathname: "/questionnaire",
                      params: { id: item.id },
                    })
                  }
                />
              );
            })}
        {connection.pendingQuestionnaires.length > 0 && (
          <T muted size={12}>
            {connection.questionnaireError || "Ответы опроса ожидают отправки."}
          </T>
        )}
        {connection.pendingQuestionnaires.length > 0 &&
          connection.questionnaireError.startsWith("Ответы не приняты") && (
            <Button
              title="Удалить отклонённую отправку опроса"
              secondary
              onPress={() =>
                Alert.alert(
                  "Удалить отправку?",
                  "Черновик останется на телефоне. Сервер не принял ответы.",
                  [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Удалить",
                      style: "destructive",
                      onPress: () =>
                        void connection.cancelPendingQuestionnaire(
                          connection.pendingQuestionnaires[0]!.commandId,
                        ),
                    },
                  ],
                )
              }
            />
          )}
        {connection.pendingReports.length > 0 && (
          <T muted size={12}>
            {connection.reportError || "Самоотчёт ожидает отправки."}
          </T>
        )}
        {connection.pendingReports.length > 0 &&
          connection.reportError.startsWith("Самоотчёт не принят") && (
            <Button
              title="Удалить отклонённую отправку"
              secondary
              onPress={() =>
                Alert.alert(
                  "Удалить отправку?",
                  "Запись останется на телефоне. Сервер не принял её.",
                  [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Удалить",
                      style: "destructive",
                      onPress: () =>
                        void connection.cancelPendingReport(
                          connection.pendingReports[0]!.commandId,
                        ),
                    },
                  ],
                )
              }
            />
          )}
      </View>
      {plan?.kind === "ready" && plan.items.length > 0 && (
        <View style={{ gap: 12, marginBottom: 22 }}>
          <T size={19} weight="500">
            Назначения врача
          </T>
          {plan.items.map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: theme.soft,
                borderRadius: 24,
                padding: 18,
                gap: 6,
              }}
            >
              <T size={17} weight="500">
                {item.title}
              </T>
              {!!item.dose && <T>{item.dose}</T>}
              {!!item.schedule && (
                <T muted size={13}>
                  {item.schedule}
                </T>
              )}
              {!!item.patientInstructions && (
                <T size={13}>{item.patientInstructions}</T>
              )}
            </View>
          ))}
        </View>
      )}
      <Button
        title="Связаться с врачом"
        icon="message"
        onPress={() => router.push("/doctor-chat" as Href)}
      />
    </Screen>
  );
}
