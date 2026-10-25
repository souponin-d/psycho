import { useEffect, useState } from "react";
import {
  BackHandler,
  Image,
  Linking,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { T, Button, RoundButton, Chip, Panel } from "../components/UI";
import { Enter, Touch } from "../components/Motion";
import { Mascot } from "../components/Mascot";
import { ThemePicker } from "../components/ThemePicker";
import { mascotOptions } from "../config/content";
import { wardrobe } from "../config/worldCatalog";
import { requestReminderPermission } from "../services/notificationPermissions";

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
    body: "Спутника, его окраску и одежду можно менять в любой момент.",
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
  const { state, dispatch, theme } = useApp();
  const { journey, act, saving } = useJourney();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [name, setName] = useState(state.name);
  const [goal, setGoal] = useState(journey?.goal ?? goals[0]);
  const [time, setTime] = useState(state.morning);
  const [permissionText, setPermissionText] = useState("");
  const [asking, setAsking] = useState(false);
  const safe = useSafeAreaInsets();
  useEffect(() => {
    dispatch({ type: "onboard", value: false });
  }, [dispatch]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step > 0) {
        setStep((s) => s - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);
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
  async function connect(value: string) {
    setCodeError("");
    if (await act({ type: "connect", code: value })) setStep(2);
    else
      setCodeError("Код не подошёл. Проверьте его или войдите в демо-режиме.");
  }
  async function next() {
    if (step === 5) {
      dispatch({ type: "preferences", patch: { name } });
      if (!(await act({ type: "goal", goal }))) return;
    }
    if (step === 6) {
      if (!validTime) return;
      dispatch({ type: "preferences", patch: { morning: time } });
    }
    if (step < 7) setStep((s) => s + 1);
    else {
      dispatch({ type: "onboard", value: true });
      router.replace("/");
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
          opacity: step === 0 || step === 7 ? 0.8 : 0.2,
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
          {(step === 0 || step === 7) && (
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
                disabled={saving}
                onPress={() => void connect(code)}
              />
              <Button
                title="Войти в демо-режиме"
                secondary
                disabled={saving}
                onPress={() => void connect("SYNCLI-START")}
              />
              <T size={12} muted>
                Сейчас подключается учебный план на синтетических данных. Связь
                с настоящим врачом пока не выполняется.
              </T>
            </>
          )}
          {step === 2 && (
            <Panel style={{ gap: 16 }}>
              <T size={18} weight="600">
                {journey.plan.medication.name}
              </T>
              <T size={14}>{journey.plan.doctor}</T>
              <T size={13} muted>
                {journey.plan.medication.dosageLabel}
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
              <T size={14} weight="600">
                Первая окраска
              </T>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {wardrobe.colors.map((color) => (
                  <Chip
                    key={color.id}
                    label={color.name}
                    active={
                      journey?.world.outfits[state.mascot].color === color.id
                    }
                    onPress={() => {
                      if (journey)
                        void act({
                          type: "world",
                          world: {
                            ...journey.world,
                            outfits: {
                              ...journey.world.outfits,
                              [state.mascot]: {
                                ...journey.world.outfits[state.mascot],
                                color: color.id,
                              },
                            },
                          },
                        });
                    }}
                  />
                ))}
              </View>
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
            <>
              <Panel style={{ gap: 12 }}>
                <T size={16} weight="600">
                  Утренний приём · {journey.plan.medication.name}
                </T>
                <T size={12} muted>
                  Меняется время напоминания. Схема и количество приёмов
                  остаются назначенными врачом.
                </T>
                <TextInput
                  accessibilityLabel="Время утреннего напоминания"
                  value={time}
                  onChangeText={setTime}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  placeholder="09:00"
                  placeholderTextColor={theme.muted}
                  style={inputStyle}
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
          {step === 7 && (
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
              <Button
                title="Посмотреть план"
                secondary
                onPress={() => {
                  dispatch({ type: "onboard", value: true });
                  router.replace("/plan");
                }}
              />
              <Button
                title="Обустроить мир"
                secondary
                onPress={() => {
                  dispatch({ type: "onboard", value: true });
                  router.replace("/shore-settings");
                }}
              />
              <Button
                title="Собрать вопросы к приёму"
                secondary
                onPress={() => {
                  dispatch({ type: "onboard", value: true });
                  router.replace("/questions");
                }}
              />
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
                  : step === 7
                    ? "На мой путь"
                    : step === 6
                      ? "Продолжить"
                      : "Дальше"
            }
            disabled={saving || (step === 6 && !validTime)}
            onPress={() => void next()}
          />
        )}
      </ScrollView>
    </View>
  );
}
