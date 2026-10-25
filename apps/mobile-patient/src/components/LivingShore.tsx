import { useEffect, useRef, useState } from "react";
import {
  View,
  Image,
  Animated,
  Easing,
  Pressable,
  type LayoutChangeEvent,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { T, RoundButton } from "./UI";
import { Touch } from "./Motion";
import { Icon } from "./Icon";
import { Mascot } from "./Mascot";
import {
  Book,
  Lotus,
  Lantern,
  MemoryStone,
  DecorationArt,
  useShoreReveal,
} from "./ShoreObjects";
import { shoreProgress } from "../core/shore";
import { useSceneMotion, useFloat } from "../hooks/useSceneMotion";
import { tasks, dayLabel } from "../config/content";
export function LivingShore() {
  const { state, theme, today } = useApp(),
    safe = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 400, height: 850 });
  const active = useSceneMotion(),
    float = useFloat(active, 3600);
  const hasMoment = state.memoryDays.includes(today);
  const reveal = useShoreReveal(hasMoment);
  const artHeight = Math.max(size.height, (size.width * 1798) / 875),
    artWidth = (artHeight * 875) / 1798;
  const compact = size.height < 740;
  const bottomActionsHeight = compact ? 54 : 111;
  const actionTop =
    size.height - Math.max(safe.bottom, 12) - 88 - bottomActionsHeight;
  const houseTop = Math.min(
    artHeight * 0.652,
    actionTop - 12 - (size.height - artHeight) / 2 - 65,
  );
  const progress = shoreProgress(state.memoryDays, today);
  const petSize = Math.min(116, artWidth * 0.26);
  const ripple = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || !hasMoment || !state.gameplay) {
      ripple.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: 3800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, hasMoment, state.gameplay, ripple]);
  const topColor = theme.dark ? "rgba(10,26,24,.72)" : "rgba(255,249,232,.76)";
  const tag = {
    backgroundColor: theme.glass,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.border,
  };
  const home = (
    path: "/questions" | "/shore-settings" | "/check-in" | "/history",
  ) => router.push(path);
  const layout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);
  const done = state.completed[today] ?? [];
  return (
    <View
      style={{ flex: 1, overflow: "hidden", backgroundColor: theme.page }}
      onLayout={layout}
    >
      <View
        style={{
          position: "absolute",
          width: artWidth,
          height: artHeight,
          left: (size.width - artWidth) / 2,
          top: (size.height - artHeight) / 2,
        }}
      >
        <Image
          source={
            theme.dark
              ? require("../../assets/images/shore-dark.png")
              : require("../../assets/images/shore-light.png")
          }
          style={{ width: artWidth, height: artHeight }}
        />
        {theme.id === "lavender" && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(183,153,219,.09)",
            }}
          />
        )}
        {state.gameplay && (
          <>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: artWidth * 0.51 - petSize * 0.5 - 12 * reveal,
                top: artHeight * 0.524 - petSize * 0.92 - 5 * reveal,
              }}
            >
              <Mascot size={petSize} />
            </View>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: artWidth * 0.61 - 32,
                top: artHeight * 0.505 - 32,
              }}
            >
              <Animated.View
                style={{
                  opacity: float.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.83, 1],
                  }),
                }}
              >
                <Lantern lit={hasMoment} size={32} />
              </Animated.View>
            </View>
            <View
              style={{
                position: "absolute",
                left: artWidth * 0.225 - 60,
                top: artHeight * 0.515 - 65,
                width: 120,
              }}
            >
              <Touch
                accessibilityRole="button"
                accessibilityLabel={
                  hasMoment
                    ? "Записать ещё один момент у пруда"
                    : "Отметить состояние у пруда"
                }
                onPress={() => home("/check-in")}
                style={{ alignItems: "center", minHeight: 114 }}
              >
                <View pointerEvents="none">
                  <Lotus open={hasMoment} size={92} />
                </View>
                <View style={tag}>
                  <T size={10} weight="500">
                    {hasMoment ? "Ещё один момент" : "Момент для себя"}
                  </T>
                </View>
              </Touch>
            </View>
            <View
              style={{
                position: "absolute",
                left: artWidth * 0.745 - 68,
                top: artHeight * 0.37 - 28,
                width: 136,
              }}
            >
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Открыть вопросы к приёму"
                onPress={() => home("/questions")}
                style={{ alignItems: "center", minHeight: 84 }}
              >
                <View pointerEvents="none">
                  <Book size={67} />
                </View>
                <View style={tag}>
                  <T size={10} weight="500">
                    Вопросы
                    {state.questions.length
                      ? ` · ${state.questions.length}`
                      : " к приёму"}
                  </T>
                </View>
              </Touch>
            </View>
            <View
              style={{
                position: "absolute",
                left: artWidth * 0.775 - 62,
                top: houseTop,
                width: 124,
              }}
            >
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Настроить мой уголок"
                onPress={() => home("/shore-settings")}
                style={{
                  minHeight: 65,
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                <View style={tag}>
                  <T size={10} weight="500">
                    Мой уголок
                  </T>
                </View>
              </Touch>
            </View>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: artWidth * 0.64,
                top: artHeight * 0.736,
              }}
            >
              <DecorationArt id={state.decoration} size={37} />
            </View>
            {state.memoryDays.length > 0 && (
              <View
                style={{
                  position: "absolute",
                  left: artWidth * 0.385 - 26,
                  top: artHeight * 0.56,
                  opacity: hasMoment ? reveal : 1,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Камешки воспоминаний: открыть историю"
                  onPress={() => home("/history")}
                  style={{
                    minHeight: 48,
                    minWidth: 64,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: -6,
                      alignItems: "flex-end",
                    }}
                  >
                    {state.memoryDays.slice(-3).map((day, i) => (
                      <View
                        key={day}
                        style={{ transform: [{ rotate: `${i * 12 - 10}deg` }] }}
                      >
                        <MemoryStone size={25 + i * 4} />
                      </View>
                    ))}
                  </View>
                </Pressable>
              </View>
            )}
            {hasMoment && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: artWidth * 0.17,
                  top: artHeight * 0.55,
                  width: 60,
                  height: 20,
                  borderRadius: 40,
                  borderWidth: 1,
                  borderColor: theme.dark ? "#DBE6BB" : "#FFFFFF",
                  opacity: ripple.interpolate({
                    inputRange: [0, 0.1, 1],
                    outputRange: [0, 0.7, 0],
                  }),
                  transform: [
                    {
                      scale: ripple.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 2.2],
                      }),
                    },
                  ],
                }}
              />
            )}
          </>
        )}
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={[
          theme.dark ? "rgba(10,26,24,.92)" : "rgba(255,249,232,.96)",
          topColor,
          "transparent",
        ]}
        locations={[0, 0.55, 1]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: size.height * (compact ? 0.39 : 0.29),
        }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", theme.page]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 140 + safe.bottom,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: safe.top + 16,
          left: 23,
          right: 22,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <T size={29} weight="600" style={{ letterSpacing: -1 }}>
              Синкли
            </T>
            <T size={19}>Тихий берег</T>
          </View>
          <RoundButton
            icon="settings"
            label="Настройки"
            onPress={() => router.push("/settings")}
          />
        </View>
        <T size={11} muted style={{ marginTop: 7 }}>
          {dayLabel(today)} · {state.name}
        </T>
        {state.gameplay && (
          <View
            style={{
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <T size={12}>{Math.min(progress.weekDays, 3)} из 3 дней внимания</T>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  backgroundColor:
                    i < progress.weekDays ? theme.accent : "transparent",
                }}
              />
            ))}
          </View>
        )}
      </View>
      <View
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: Math.max(safe.bottom, 12) + 88,
          gap: 9,
        }}
      >
        {!state.gameplay && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Вопросы к приёму"
                onPress={() => home("/questions")}
                style={{
                  ...tag,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T size={12}>Вопросы к приёму</T>
              </Touch>
            </View>
            <View style={{ flex: 1 }}>
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Настроить берег"
                onPress={() => home("/shore-settings")}
                style={{
                  ...tag,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T size={12}>Мой уголок</T>
              </Touch>
            </View>
          </View>
        )}
        {!compact && (
          <Touch
            accessibilityRole="button"
            accessibilityLabel="План на сегодня"
            onPress={() => router.push("/plan")}
            style={{
              ...tag,
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
            >
              <Icon name="leaf" color={theme.text} size={18} />
              <T size={13}>
                Сегодня · {done.length} из {tasks.length} событий
              </T>
            </View>
            <Icon name="arrow" color={theme.text} size={17} />
          </Touch>
        )}
        <Touch
          accessibilityRole="button"
          accessibilityLabel="Отметить самочувствие"
          onPress={() => home("/check-in")}
          style={{
            minHeight: 54,
            borderRadius: 25,
            paddingHorizontal: 18,
            paddingVertical: 12,
            backgroundColor: theme.accent,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <T size={14} weight="500" style={{ color: theme.onAccent }}>
            Отметить самочувствие
          </T>
          <Icon name="heart" color={theme.onAccent} size={20} />
        </Touch>
      </View>
    </View>
  );
}
