import { useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { journeyMap } from "../core/journeyMap";
import { journeyProgress } from "../core/calendar";
import { assignedTasks } from "../core/questionnaires";
import { T, Button, RoundButton } from "./UI";
import { Touch } from "./Motion";
import { Icon } from "./Icon";
import { Mascot } from "./Mascot";

// Stone centres in the illustrated landscape, from the first step upwards.
const stones = [
  [0.58, 0.875],
  [0.49, 0.72],
  [0.75, 0.585],
  [0.31, 0.437],
  [0.69, 0.34],
  [0.38, 0.25],
  [0.51, 0.175],
  [0.69, 0.12],
  [0.62, 0.067],
];
const statusLabels = {
  complete: "День выполнен",
  missed: "День пропущен",
  today: "Сегодня",
  future: "Впереди",
};
function dateLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

export function JourneyMap() {
  const { state, theme, today, reducedMotion } = useApp();
  const { journey } = useJourney();
  const safe = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(600);
  const [contentHeight, setContentHeight] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const map = journey ? journeyMap(journey, today) : null;
  const tileHeight = width * 3;
  const tileCount = Math.ceil((map?.days.length ?? 0) / stones.length);
  const height = tileCount * tileHeight;
  const todayIndex = map?.todayIndex ?? 0;
  const todayY =
    (tileCount -
      1 -
      Math.floor(todayIndex / stones.length) +
      stones[todayIndex % stones.length][1]) *
    tileHeight;
  const todayOffset = Math.max(
    0,
    220 + todayY - Math.max(330, viewport * 0.58),
  );
  useEffect(() => {
    if (!contentHeight) return;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: todayOffset, animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [contentHeight, todayOffset]);
  if (!journey || !map) return null;
  const progress = journeyProgress(journey, today);
  const position = (index: number) => {
    const [x, y] = stones[index % stones.length];
    return {
      x: x * width,
      y: (tileCount - 1 - Math.floor(index / stones.length) + y) * tileHeight,
    };
  };
  const goToday = (animated = !reducedMotion) => {
    scroll.current?.scrollTo({
      y: todayOffset,
      animated,
    });
  };
  const selectedDay = map.days.find((d) => d.day === selected);
  const tasks = selected ? assignedTasks(journey, selected) : [];
  const dark = state.theme === "dark";
  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScrollView
        ref={scroll}
        accessibilityLabel="Мой путь: вертикальная карта дней"
        showsVerticalScrollIndicator
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, measuredHeight) =>
          setContentHeight(measuredHeight)
        }
        contentContainerStyle={{ paddingTop: 220, paddingBottom: 180 }}
      >
        <View style={{ height, width }}>
          {Array.from({ length: tileCount }, (_, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                top: i * tileHeight,
                width,
                height: tileHeight,
              }}
            >
              <Image
                source={require("../../assets/images/journey-environment.png")}
                accessible={false}
                style={{ width, height: tileHeight }}
                resizeMode="stretch"
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: dark
                    ? "rgba(9,20,36,0.58)"
                    : "rgba(255,247,224,0.04)",
                }}
              />
            </View>
          ))}
          {Array.from({ length: Math.max(0, tileCount - 1) }, (_, i) => (
            <LinearGradient
              key={`mist-${i}`}
              pointerEvents="none"
              colors={[
                `${theme.page}00`,
                theme.page,
                theme.page,
                `${theme.page}00`,
              ]}
              locations={[0, 0.42, 0.58, 1]}
              style={{
                position: "absolute",
                top: (i + 1) * tileHeight - 100,
                width,
                height: 200,
              }}
            />
          ))}
          {map.days.map((day) => {
            const p = position(day.index);
            const active = day.status === "today";
            const done = day.status === "complete";
            const future = day.status === "future";
            return (
              <View
                key={day.day}
                style={{
                  position: "absolute",
                  left: p.x - 64,
                  top: p.y - 32,
                  width: 128,
                  alignItems: "center",
                }}
              >
                {active && (
                  <View
                    style={{
                      position: "absolute",
                      top: -110,
                      width: 112,
                      height: 112,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Mascot size={96} />
                  </View>
                )}
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel={`${dateLabel(day.day)}. ${statusLabels[day.status]}. День пути ${day.index + 1}`}
                  onPress={() => setSelected(day.day)}
                  style={{
                    width: active ? 72 : 56,
                    height: active ? 64 : 48,
                    borderRadius: 32,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active
                      ? theme.accent
                      : done
                        ? "#345D43"
                        : future
                          ? "#EEE5D4"
                          : "#D2C3AD",
                    borderWidth: active ? 3 : 2,
                    borderColor: active ? "#FDF4CE" : "#FFF7E4",
                    boxShadow: "0 6px 0 rgba(54,57,36,0.32)",
                  }}
                >
                  {done ? (
                    <Icon name="check" color="#FFFFFF" size={26} />
                  ) : (
                    <T
                      weight="700"
                      size={20}
                      style={{ color: active ? theme.onAccent : "#4B4B3F" }}
                    >
                      {future ? "·" : day.index + 1}
                    </T>
                  )}
                </Touch>
                <View
                  style={{
                    position: "absolute",
                    top: active ? 20 : 10,
                    left: p.x > width * 0.5 ? -66 : 100,
                    width: 100,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: dark ? "#172D29" : "#FFF8E8",
                  }}
                >
                  <T size={11} weight="600">
                    {active ? "Сегодня" : dateLabel(day.day)}
                    {day.status === "missed" ? " · пропуск" : ""}
                  </T>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.page, `${theme.page}00`]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: safe.top + 180,
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: safe.top + 12,
          left: 20,
          right: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <T size={28} weight="700">
              Мой путь
            </T>
            <T size={12} weight="600">
              Глава {progress.chapterIndex + 1} · стрик {progress.streak}
            </T>
          </View>
          <RoundButton
            icon="settings"
            label="Настройки"
            onPress={() => router.push("/settings")}
          />
        </View>
        <View
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 20,
            backgroundColor: theme.glass,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <T size={13} weight="600">
            {journey.goal}
          </T>
          <T size={11} muted>
            Недельная награда: {progress.successes} / {progress.goal}{" "}
            выполненных дней
          </T>
          <View
            style={{
              height: 4,
              backgroundColor: theme.soft,
              borderRadius: 4,
              marginTop: 8,
            }}
          >
            <View
              style={{
                height: 4,
                width: `${Math.min(100, (progress.successes / progress.goal) * 100)}%`,
                backgroundColor: theme.accent,
                borderRadius: 4,
              }}
            />
          </View>
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          bottom: Math.max(safe.bottom, 12) + 88,
          left: 20,
          right: 20,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Touch
          accessibilityRole="button"
          accessibilityLabel="Вернуться к сегодняшнему дню"
          onPress={() => goToday()}
          style={{
            padding: 14,
            borderRadius: 22,
            backgroundColor: theme.glass,
          }}
        >
          <T size={13} weight="600">
            К сегодняшнему дню
          </T>
        </Touch>
        <Touch
          accessibilityRole="button"
          accessibilityLabel="Открыть план на сегодня"
          onPress={() => router.push("/(tabs)/plan")}
          style={{
            padding: 14,
            borderRadius: 22,
            backgroundColor: theme.accent,
          }}
        >
          <T size={13} weight="600" style={{ color: theme.onAccent }}>
            План на сегодня
          </T>
        </Touch>
      </View>
      <Modal
        visible={!!selectedDay}
        transparent
        animationType={reducedMotion ? "none" : "slide"}
        onRequestClose={() => setSelected(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(4,18,16,0.4)",
          }}
        >
          <View
            style={{
              padding: 24,
              paddingBottom: Math.max(24, safe.bottom),
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              backgroundColor: theme.page,
              maxHeight: "80%",
            }}
          >
            <ScrollView>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <T size={24} weight="600">
                  {selected && dateLabel(selected)}
                </T>
                <RoundButton
                  icon="close"
                  label="Закрыть день"
                  onPress={() => setSelected(null)}
                />
              </View>
              <T size={16} weight="600" style={{ marginVertical: 16 }}>
                {selectedDay && statusLabels[selectedDay.status]}
              </T>
              {selectedDay?.status === "missed" && (
                <T size={13} muted>
                  Прогресс мира сохранён. Сегодня можно продолжить путь.
                </T>
              )}
              {tasks.map((task) => (
                <T key={task.id} size={14} style={{ marginTop: 12 }}>
                  {task.completed ? "✓ " : "○ "}
                  {task.title}
                </T>
              ))}
              <View style={{ marginTop: 24, gap: 12 }}>
                {selectedDay?.status === "today" && (
                  <Button
                    title="Открыть план"
                    onPress={() => {
                      setSelected(null);
                      router.push("/(tabs)/plan");
                    }}
                  />
                )}
                <Button
                  title="Вернуться на путь"
                  secondary
                  onPress={() => setSelected(null)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
