import { useEffect, useState } from "react";
import {
  View,
  Image,
  ScrollView,
  TextInput,
  StyleSheet,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { T, Button, RoundButton, Chip } from "../components/UI";
import { Enter, Touch } from "../components/Motion";
import { Mascot } from "../components/Mascot";
import { ThemePicker } from "../components/ThemePicker";
import { Icon } from "../components/Icon";
import { mascotOptions, onboardingCopy } from "../config/content";

export default function Onboarding() {
  const { state, dispatch, theme } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.name);
  const safe = useSafeAreaInsets();
  const { height } = useWindowDimensions();
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
  const copy = onboardingCopy[step]!;
  function next() {
    if (step === 3) dispatch({ type: "preferences", patch: { name } });
    if (step < 4) setStep((s) => s + 1);
    else {
      dispatch({ type: "onboard", value: true });
      router.replace("/");
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      {(step === 0 || step === 4) && (
        <>
          <Image
            source={theme.landscape}
            style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={[
              theme.page,
              theme.dark ? "rgba(16,39,32,0.12)" : "rgba(246,245,237,0.1)",
              theme.page,
            ]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: safe.top + 12,
          paddingHorizontal: 28,
          paddingBottom: 32,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: 48,
          }}
        >
          {step > 0 ? (
            <RoundButton
              icon="back"
              label="Предыдущий шаг"
              onPress={() => setStep((s) => s - 1)}
            />
          ) : (
            <T weight="700" size={23} style={{ letterSpacing: -1 }}>
              синкли
            </T>
          )}
          <View style={{ flexDirection: "row", gap: 5 }}>
            {onboardingCopy.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === step ? 26 : 6,
                  height: 6,
                  borderRadius: 5,
                  backgroundColor: i === step ? theme.accent : theme.border,
                }}
              />
            ))}
          </View>
        </View>
        <Enter
          key={`heading-${step}`}
          delay={50}
          style={{ marginTop: step === 0 ? 45 : 28 }}
        >
          <T
            size={step === 0 ? 50 : 42}
            weight="500"
            style={{ lineHeight: step === 0 ? 54 : 46, letterSpacing: -1.9 }}
          >
            {copy.title}
          </T>
          <T size={15} muted style={{ marginTop: 14, lineHeight: 22 }}>
            {copy.body}
          </T>
        </Enter>
        <Enter
          key={`content-${step}`}
          delay={150}
          style={{
            flex: 1,
            minHeight: Math.max(260, height * 0.34),
            justifyContent: "center",
            paddingVertical: 24,
          }}
        >
          {(step === 0 || step === 4) && (
            <View style={{ alignItems: "center", paddingTop: 12 }}>
              <Mascot size={Math.min(270, height * 0.32)} />
              {step === 4 && (
                <View
                  style={{
                    backgroundColor: theme.glass,
                    borderRadius: 22,
                    padding: 16,
                    marginTop: 10,
                    gap: 12,
                    width: "100%",
                  }}
                >
                  {[
                    {
                      icon: "leaf" as const,
                      text: "Посмотрите план на сегодня",
                    },
                    {
                      icon: "heart" as const,
                      text: "Отметьте, как вы себя чувствуете",
                    },
                    {
                      icon: "message" as const,
                      text: "Освойтесь вместе со спутником",
                    },
                  ].map((item) => (
                    <View
                      key={item.text}
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <Icon name={item.icon} color={theme.accent} size={20} />
                      <T size={13}>{item.text}</T>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
          {step === 1 && (
            <View style={{ flexDirection: "row", gap: 12 }}>
              {mascotOptions.map((m) => (
                <View key={m.id} style={{ flex: 1 }}>
                  <Touch
                    accessibilityRole="button"
                    accessibilityLabel={`Выбрать: ${m.name}`}
                    accessibilityState={{ selected: state.mascot === m.id }}
                    onPress={() =>
                      dispatch({ type: "preferences", patch: { mascot: m.id } })
                    }
                    style={{
                      backgroundColor:
                        state.mascot === m.id ? theme.soft : theme.surface,
                      borderColor:
                        state.mascot === m.id ? theme.accent : theme.border,
                      borderWidth: state.mascot === m.id ? 2 : 1,
                      borderRadius: 32,
                      paddingVertical: 24,
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View
                      pointerEvents="none"
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Mascot id={m.id} size={120} />
                    </View>
                    <T size={17} weight="600">
                      {m.name}
                    </T>
                    <T
                      size={11}
                      muted
                      style={{ textAlign: "center", paddingHorizontal: 10 }}
                    >
                      {m.detail}
                    </T>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 20,
                        backgroundColor:
                          state.mascot === m.id ? theme.accent : theme.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {state.mascot === m.id && (
                        <Icon name="check" size={17} color={theme.onAccent} />
                      )}
                    </View>
                  </Touch>
                </View>
              ))}
            </View>
          )}
          {step === 2 && (
            <>
              <ThemePicker />
              <View style={{ alignItems: "center", marginTop: 20 }}>
                <Mascot size={100} />
                <T muted size={12}>
                  Оформление можно менять в любой момент
                </T>
              </View>
            </>
          )}
          {step === 3 && (
            <View style={{ gap: 22 }}>
              <View style={{ gap: 10 }}>
                <T size={14} weight="500">
                  Как к вам обращаться?
                </T>
                <TextInput
                  accessibilityLabel="Ваше имя"
                  value={name}
                  onChangeText={setName}
                  placeholder="Анна"
                  placeholderTextColor={theme.muted}
                  maxLength={30}
                  style={{
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 18,
                    backgroundColor: theme.surface,
                    color: theme.text,
                    fontFamily: "Onest",
                    fontSize: 20,
                  }}
                />
              </View>
              <View style={{ gap: 12 }}>
                <T size={14} weight="500">
                  Когда начинается ваше утро?
                </T>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["08:00", "09:00", "10:00"].map((time) => (
                    <Chip
                      key={time}
                      label={time}
                      active={state.morning === time}
                      onPress={() =>
                        dispatch({
                          type: "preferences",
                          patch: { morning: time },
                        })
                      }
                    />
                  ))}
                </View>
                <T size={12} muted>
                  Время первого события в вашем плане.
                </T>
              </View>
            </View>
          )}
        </Enter>
        <View style={{ gap: 12, marginBottom: safe.bottom }}>
          <Button
            title={
              step === 0
                ? "Давайте знакомиться"
                : step === 4
                  ? "В мой день"
                  : "Продолжить"
            }
            onPress={next}
          />
          <T size={11} muted style={{ textAlign: "center" }}>
            {step === 0
              ? "Прототип. Все данные вымышлены."
              : step === 1
                ? "Коснитесь спутника — он вам улыбнётся"
                : "Всё это можно изменить позже"}
          </T>
          {step === 3 && (
            <Touch
              onPress={next}
              accessibilityRole="button"
              accessibilityLabel="Пропустить настройку"
              style={{ padding: 12, alignItems: "center" }}
            >
              <T size={13} muted>
                Настроить позже
              </T>
            </Touch>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
