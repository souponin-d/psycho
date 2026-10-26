import { patientLabel } from "../core/patientPresentation";
import { assignedTasks } from "../core/questionnaires";
import { useReminders } from "../state/ReminderProvider";
import { requestExactAlarmAccess } from "../services/exactAlarm";
import { TimeControl } from "../components/TimeControl";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  BackHandler,
  PanResponder,
  useWindowDimensions,
  Image,
  Linking,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { initialOnboarding } from "../core/onboarding";
import { FeelingGrid } from "../components/FeelingGrid";
import { WorldItemArt } from "../components/WorldItemArt";
import type { FeelingPoint } from "../core/feelings";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { T, Button, RoundButton, Chip, Panel } from "../components/UI";
import { Enter, Touch } from "../components/Motion";
import { Mascot } from "../components/Mascot";
import { ThemePicker } from "../components/ThemePicker";
import { mascotOptions } from "../config/content";
import { requestReminderPermission } from "../services/notificationPermissions";
import { usePatientConnection } from "../state/PatientConnectionProvider";

const steps = [
  {
    title: "Привет,\nэто Синкли",
    body: "Небольшие ежедневные шаги помогают оставаться в своём ритме. А рядом будет ваш спутник.",
  },
  {
    title: "Ваш план —\nот врача",
    body: "Введите пригласительный код, чтобы открыть назначенный план.",
  },
  {
    title: "Давайте\nосмотримся",
    body: "Вот что будет сопровождать вас в ближайшие дни.",
  },
  {
    title: "Кто пойдёт\nс вами?",
    body: "Спутника и его одежду можно менять в любой момент.",
  },
  {
    title: "Ваше\nнастроение света",
    body: "Три оформления одного мира. Выбирайте то, в котором вам уютнее.",
  },
  {
    title: "Ради чего\nвы начинаете?",
    body: "Пусть на пути будет ваша собственная цель. Она не меняет назначения врача.",
  },
  {
    title: "Попробуйте отметить приём",
    body: "Это тренировочная отметка. Настоящий приём отмечайте только после выполнения назначения.",
  },
  {
    title: "Найдите своё ощущение",
    body: "Проведите пальцем по карте. Слева — меньше приятных ощущений, справа — больше. Выше — больше энергии.",
  },
  {
    title: "Самоотчёт и личный момент",
    body: "Самоотчёт входит в план дня: ощущение и короткие вопросы. Личный момент — дополнительная заметка для себя, он не заменяет самоотчёт.",
  },
  {
    title: "Ваш путь по календарю",
    body: "Листайте карту вверх и вниз. Каждая точка — отдельный день с приёмами, самоотчётом и назначенным опросом.",
  },
  {
    title: "Мир можно обустроить",
    body: "Попробуйте передвинуть фонарь. В мастерской можно свободно расставлять открытые предметы, менять окружение и наряды спутника.",
  },
  {
    title: "В удобное\nдля вас время",
    body: "Напоминания помогут не потеряться среди повседневных дел.",
  },
  {
    title: "Каждый день —\nновая точка",
    body: "Сегодня уже ждёт вас на карте. Начните с плана, остальное исследуйте в своём темпе.",
  },
];
const goals = [
  "Следовать плану терапии",
  "Возвращаться к любимым занятиям",
  "Создать устойчивую привычку",
];
export default function Onboarding() {
  const { state, dispatch, theme, today, reducedMotion } = useApp();
  const reminders = useReminders();
  const practicePath = useRef<ScrollView>(null);
  const { journey, act, saving } = useJourney();
  const connection = usePatientConnection();
  const { replay, access } = useLocalSearchParams<{
    replay?: string;
    access?: string;
  }>();
  const accessOnly = access === "1" && !replay;
  const initial =
    journey?.onboarding && !journey.onboarding.completed && !replay
      ? journey.onboarding
      : initialOnboarding(journey?.goal, state.name, state.morning);
  const [step, setStep] = useState(accessOnly ? 1 : initial.step);
  const [practiceDose, setPracticeDose] = useState(initial.practiceDose);
  const [practiceFeeling, setPracticeFeeling] = useState<FeelingPoint | null>(
    initial.practiceFeeling ?? null,
  );
  const [practiceItem, setPracticeItem] = useState(initial.practiceItem);
  const { width } = useWindowDimensions();
  const practiceSize = Math.min(width - 48, 320);
  const dragStart = useRef(practiceItem);
  const practicePosition = useRef(practiceItem);
  practicePosition.current = practiceItem;
  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStart.current = practicePosition.current;
        },
        onPanResponderMove: (_, g) =>
          setPracticeItem({
            x: Math.max(
              0,
              Math.min(1, dragStart.current.x + g.dx / (practiceSize - 70)),
            ),
            y: Math.max(0, Math.min(1, dragStart.current.y + g.dy / 130)),
          }),
        onPanResponderRelease: () => {},
      }),
    [practiceSize],
  );
  const [code, setCode] = useState(initial.code);
  const [codeError, setCodeError] = useState("");
  const [name, setName] = useState(initial.name);
  const [goal, setGoal] = useState(initial.goal);
  const [time, setTime] = useState(initial.morning);
  const [permissionText, setPermissionText] = useState("");
  const [asking, setAsking] = useState(false);
  const safe = useSafeAreaInsets();
  useEffect(() => {
    if (accessOnly) return;
    const timer = setTimeout(
      () =>
        void act({
          type: "onboarding:save",
          progress: {
            version: 1,
            step,
            code: "",
            name,
            goal,
            morning: time,
            practiceDose,
            ...(practiceFeeling ? { practiceFeeling } : {}),
            practiceItem,
            completed: false,
          },
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [
    act,
    step,
    code,
    name,
    goal,
    time,
    accessOnly,
    practiceDose,
    practiceFeeling,
    practiceItem,
  ]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step > 0 && !accessOnly) {
        setStep((s) => s - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step, accessOnly]);
  if (!journey) return null;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const inputStyle = {
    fontFamily: "Onest",
    fontSize: 18,
    padding: 18,
    borderRadius: 20,
    backgroundColor: theme.surface,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
  };
  async function connect(value: string, demo = false) {
    setCodeError("");
    try {
      if (demo) await connection.demo();
      else await connection.connect(value);
      // This flag opens the existing local teaching journey, not an API session.
      // Server access is controlled separately by the authenticated channel.
      if (!(await act({ type: "connect", code: "SYNCLI-START" })))
        throw new Error(
          "Не удалось открыть записи на телефоне. Подключитесь ещё раз.",
        );
      setCode("");
      if (accessOnly) router.replace("/");
      else setStep(2);
    } catch (e) {
      setCodeError(
        e instanceof Error
          ? e.message
          : "Не удалось подключиться. Попробуйте ещё раз.",
      );
    }
  }
  async function next() {
    if (!journey) return;
    if (step === 5) {
      dispatch({ type: "preferences", patch: { name } });
      if (!(await act({ type: "goal", goal }))) return;
    }
    if (step === 11) {
      if (!validTime) return;
      dispatch({ type: "preferences", patch: { morning: time } });
    }
    if (
      !(await act({
        type: "onboarding:save",
        progress: {
          version: 1,
          step: Math.min(12, step + 1),
          code: "",
          name,
          goal,
          morning: time,
          practiceDose,
          ...(practiceFeeling ? { practiceFeeling } : {}),
          practiceItem,
          completed: step === 12,
        },
      }))
    )
      return;
    if (step < 12) setStep((s) => s + 1);
    else {
      dispatch({ type: "onboard", value: true });
      const first = assignedTasks(journey, today).find((t) => !t.completed);
      if (first?.kind === "report") router.replace("/check-in");
      else if (first?.kind === "questionnaire")
        router.replace({
          pathname: "/questionnaire",
          params: { id: first.id },
        });
      else router.replace(first ? "/plan" : "/");
    }
  }
  async function permissions() {
    setAsking(true);
    try {
      setPermissionText(
        (await requestReminderPermission())
          ? "Уведомления разрешены. Время можно изменить в настройках."
          : "Уведомления пока выключены. Их можно разрешить в настройках телефона.",
      );
    } catch {
      setPermissionText(
        "Не удалось проверить разрешение. Вы сможете вернуться к нему в настройках.",
      );
    } finally {
      setAsking(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <Image
        source={theme.landscape}
        accessible={false}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          opacity: step === 0 || step === 12 ? 0.8 : 0.2,
        }}
        resizeMode="cover"
      />
      <LinearGradient
        pointerEvents="none"
        colors={[theme.page, theme.page + "22", theme.page]}
        style={{ position: "absolute", inset: 0 }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: safe.top + 12,
          paddingHorizontal: 24,
          paddingBottom: Math.max(24, safe.bottom),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 48,
          }}
        >
          {step ? (
            <RoundButton
              icon="back"
              label="Предыдущий шаг"
              onPress={() => setStep((s) => s - 1)}
            />
          ) : (
            <T size={23} weight="700">
              синкли
            </T>
          )}
          <T muted size={12}>
            {step + 1} / {steps.length}
          </T>
        </View>
        <Enter key={"title-" + step} style={{ marginTop: 24 }}>
          <T
            size={36}
            weight="500"
            style={{ lineHeight: 41, letterSpacing: -1.2 }}
          >
            {steps[step].title}
          </T>
          <T size={15} muted style={{ marginTop: 16 }}>
            {steps[step].body}
          </T>
        </Enter>
        <Enter
          key={"body-" + step}
          delay={80}
          style={{
            flex: 1,
            minHeight: 220,
            justifyContent: "center",
            paddingVertical: 28,
            gap: 16,
          }}
        >
          {(step === 0 || step === 12) && (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <Mascot size={200} />
            </View>
          )}
          {step === 1 && (
            <>
              <T size={14} weight="600">
                Код приглашения
              </T>
              <TextInput
                accessibilityLabel="Код приглашения от врача"
                autoCapitalize="characters"
                autoCorrect={false}
                value={code}
                onChangeText={(value) => {
                  setCode(value);
                  setCodeError("");
                }}
                placeholder="Например, SYNCLI-START"
                placeholderTextColor={theme.muted}
                maxLength={40}
                style={inputStyle}
                onSubmitEditing={() => void connect(code)}
              />
              {!!codeError && (
                <T accessibilityRole="alert" size={13}>
                  {codeError}
                </T>
              )}
              <Button
                title="Подключить план"
                disabled={saving || connection.opening}
                onPress={() => void connect(code)}
              />
              <Button
                title="Войти в демо-режиме"
                secondary
                disabled={saving || connection.opening}
                onPress={() => void connect("SYNCLI-START", true)}
              />
              <T size={12} muted>
                Сейчас подключается учебный план на синтетических данных…
              </T>
            </>
          )}
          {step === 2 && (
            <Panel style={{ gap: 16 }}>
              <T size={18} weight="600">
                {journey.plan.medication.name}
              </T>
              <T size={14}>{patientLabel(journey.plan.doctor)}</T>
              <T size={13} muted>
                {patientLabel(
                  journey.plan.medication.dosageLabel,
                  "Дозировка не указана",
                )}
              </T>
              {journey.plan.medication.slots.map((slot) => (
                <T size={14} key={slot.id}>
                  {slot.time} · {slot.label}
                </T>
              ))}
              <T size={14}>Ежедневный самоотчёт и назначенные опросы</T>
              <T size={13} muted>
                Ближайший визит:{" "}
                {new Date(journey.plan.visit.day + "T12:00").toLocaleDateString(
                  "ru-RU",
                )}{" "}
                в {journey.plan.visit.time}
              </T>
            </Panel>
          )}
          {step === 3 && (
            <>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {mascotOptions.map((m) => (
                  <View key={m.id} style={{ flex: 1 }}>
                    <Touch
                      accessibilityRole="button"
                      accessibilityLabel={"Выбрать: " + m.name}
                      accessibilityState={{ selected: state.mascot === m.id }}
                      onPress={() =>
                        dispatch({
                          type: "preferences",
                          patch: { mascot: m.id },
                        })
                      }
                      style={{
                        borderRadius: 28,
                        paddingVertical: 20,
                        alignItems: "center",
                        backgroundColor:
                          state.mascot === m.id ? theme.soft : theme.surface,
                        borderWidth: 2,
                        borderColor:
                          state.mascot === m.id ? theme.accent : theme.border,
                        gap: 12,
                      }}
                    >
                      <View
                        pointerEvents="none"
                        importantForAccessibility="no-hide-descendants"
                      >
                        <Mascot id={m.id} size={112} />
                      </View>
                      <T weight="600" size={16}>
                        {m.name}
                      </T>
                      <T size={11} muted>
                        {m.detail}
                      </T>
                    </Touch>
                  </View>
                ))}
              </View>
              <T size={13} muted>
                Коснитесь спутника — он отзовётся. Наряды и украшения ждут в
                мастерской.
              </T>
            </>
          )}
          {step === 4 && <ThemePicker />}
          {step === 5 && (
            <>
              <T size={14} weight="600">
                Как к вам обращаться?
              </T>
              <TextInput
                accessibilityLabel="Ваше имя"
                value={name}
                onChangeText={setName}
                maxLength={30}
                placeholderTextColor={theme.muted}
                placeholder="Ваше имя"
                style={inputStyle}
              />
              <T size={14} weight="600">
                Моя цель
              </T>
              <View style={{ gap: 8 }}>
                {goals.map((text) => (
                  <Chip
                    key={text}
                    label={text}
                    active={goal === text}
                    onPress={() => setGoal(text)}
                  />
                ))}
              </View>
              <TextInput
                accessibilityLabel="Личная цель"
                value={goal}
                onChangeText={setGoal}
                maxLength={120}
                multiline
                style={inputStyle}
              />
            </>
          )}
          {step === 6 && (
            <Panel style={{ gap: 16 }}>
              <T weight="600">Тренировка · утренний приём</T>
              <T muted size={13}>
                {journey.plan.medication.name}. Эта проба не попадёт в историю.
              </T>
              <Button
                title={
                  practiceDose ? "Отметка поставлена ✓" : "Попробовать отметить"
                }
                onPress={() => setPracticeDose((v) => !v)}
              />
            </Panel>
          )}
          {step === 7 && (
            <View style={{ alignItems: "center", gap: 12 }}>
              <FeelingGrid
                size={practiceSize}
                point={practiceFeeling}
                onChange={setPracticeFeeling}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  ["Менее приятно", "valence", -1],
                  ["Приятнее", "valence", 1],
                  ["Меньше энергии", "energy", -1],
                  ["Больше энергии", "energy", 1],
                ].map(([label, axis, delta]) => (
                  <Chip
                    key={label}
                    label={String(label)}
                    onPress={() =>
                      setPracticeFeeling((p) => {
                        const value = p ?? { valence: 3, energy: 3 };
                        return {
                          ...value,
                          [String(axis)]: Math.max(
                            0,
                            Math.min(
                              6,
                              value[axis as "valence" | "energy"] +
                                Number(delta),
                            ),
                          ),
                        };
                      })
                    }
                  />
                ))}
              </View>
              <T size={13} muted>
                Выбор здесь не сохраняется как самоотчёт.
              </T>
            </View>
          )}
          {step === 8 && (
            <Panel style={{ gap: 16 }}>
              <T weight="600">Чтобы день был выполнен</T>
              <T>
                Все назначенные приёмы + самоотчёт + опрос, если он назначен
                сегодня.
              </T>
              <T muted size={13}>
                Вопросы и частоту задаёт врач. Результаты опросов пациенту не
                показываются — только подтверждение прохождения.
              </T>
            </Panel>
          )}
          {step === 9 && (
            <>
              <ScrollView
                ref={practicePath}
                nestedScrollEnabled
                style={{
                  height: 250,
                  flexGrow: 0,
                  borderRadius: 24,
                  backgroundColor: theme.soft,
                }}
                contentContainerStyle={{ padding: 24, gap: 36 }}
              >
                {[
                  "Вчера · сохранено в истории",
                  "Сегодня · ваш следующий шаг",
                  "Завтра · откроется по календарю",
                  "Новая глава · 5 выполненных дней из 7",
                ].map((text, i) => (
                  <View
                    key={text}
                    style={{
                      marginLeft: i % 2 ? 60 : 0,
                      padding: 16,
                      borderRadius: 24,
                      backgroundColor: theme.surface,
                    }}
                  >
                    <T>{text}</T>
                  </View>
                ))}
              </ScrollView>
              <Button
                title="К сегодняшнему дню"
                secondary
                onPress={() =>
                  practicePath.current?.scrollTo({
                    y: 70,
                    animated: !reducedMotion,
                  })
                }
              />
            </>
          )}
          {step === 10 && (
            <>
              <T size={14}>
                За 5 выполненных дней из 7 откроется территория «Тихий сад».
                Награды сохраняются после паузы.
              </T>
              <View
                style={{
                  height: 220,
                  borderRadius: 24,
                  backgroundColor: theme.soft,
                  overflow: "hidden",
                }}
              >
                <View
                  {...drag.panHandlers}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel="Тренировочный фонарь. Смахните, чтобы переместить"
                  accessibilityActions={[
                    { name: "increment", label: "Передвинуть вправо" },
                    { name: "decrement", label: "Передвинуть влево" },
                  ]}
                  onAccessibilityAction={(e) =>
                    setPracticeItem((p) => ({
                      ...p,
                      x: Math.max(
                        0,
                        Math.min(
                          1,
                          p.x +
                            (e.nativeEvent.actionName === "increment"
                              ? 0.1
                              : -0.1),
                        ),
                      ),
                    }))
                  }
                  style={{
                    position: "absolute",
                    left: practiceItem.x * (practiceSize - 70),
                    top: practiceItem.y * 130,
                    width: 70,
                    height: 80,
                  }}
                >
                  <WorldItemArt id="lantern" size={70} />
                </View>
              </View>
            </>
          )}
          {step === 11 && (
            <>
              <Panel style={{ gap: 12 }}>
                <T size={16} weight="600">
                  Утренний приём · {journey.plan.medication.name}
                </T>
                <T size={12} muted>
                  Меняется время напоминания. Схема и количество приёмов
                  остаются назначенными врачом.
                </T>
                <TimeControl
                  label="Время утреннего напоминания"
                  value={time}
                  onChange={setTime}
                />
                {!validTime && (
                  <T size={12}>
                    Введите время от 00:00 до 23:59, например 07:45.
                  </T>
                )}
              </Panel>
              <Button
                secondary
                title={
                  asking ? "Проверяем разрешение…" : "Разрешить уведомления"
                }
                disabled={asking}
                onPress={() => void permissions()}
              />
              {reminders.nextAt && (
                <T size={13}>
                  Следующий сигнал:{" "}
                  {new Date(reminders.nextAt).toLocaleString("ru-RU")}
                </T>
              )}
              {reminders.allowed && reminders.precise === false && (
                <Button
                  title="Разрешить точное время"
                  secondary
                  onPress={() => {
                    requestExactAlarmAccess();
                    reminders.refresh();
                  }}
                />
              )}
              {!!permissionText && (
                <T size={13} muted>
                  {permissionText}
                </T>
              )}
              {permissionText.includes("выключены") && (
                <Button
                  title="Настройки телефона"
                  secondary
                  onPress={() => void Linking.openSettings()}
                />
              )}
              <T size={12} muted>
                Разрешение можно настроить позже. Для точного времени Android
                может запросить отдельный доступ.
              </T>
            </>
          )}
          {step === 12 && (
            <Panel style={{ gap: 16 }}>
              <T size={15} weight="600">
                Как продолжать путь
              </T>
              <T size={14}>1. Отмечайте каждый назначенный приём.</T>
              <T size={14}>
                2. Заполняйте самоотчёт и опрос, если он назначен сегодня.
              </T>
              <T size={14}>
                3. Передвигайтесь по календарной карте и обустраивайте свой мир.
              </T>
              <T size={12} muted>
                День закрывается строго в 00:00. Пропуск прерывает стрик, но
                сохраняет территории, награды и украшения. Исправления в истории
                не восстанавливают прошлый стрик.
              </T>
            </Panel>
          )}
        </Enter>
        {step !== 1 && (
          <Button
            title={
              step === 0
                ? "Давайте знакомиться"
                : step === 2
                  ? "Это мой план"
                  : step === 12
                    ? "На мой путь"
                    : step === 11
                      ? "Продолжить"
                      : "Дальше"
            }
            disabled={
              saving ||
              (step === 11 && !validTime) ||
              (step === 5 && !goal.trim())
            }
            onPress={() => void next()}
          />
        )}
      </ScrollView>
    </View>
  );
}
