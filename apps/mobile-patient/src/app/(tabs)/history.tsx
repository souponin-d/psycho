import { useRef, useState } from "react";
import { View, ScrollView, ImageBackground } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Screen, T, Heading, Panel, Button } from "../../components/UI";
import { Touch } from "../../components/Motion";
import { Mascot } from "../../components/Mascot";
import { MoodFace } from "../../components/MoodFace";
import { FeelingCharacter } from "../../components/FeelingCharacter";
import { feelingAt, feelingHint } from "../../core/feelings";
import { useApp } from "../../state/AppProvider";
import { dayLabel, recentDays, moodOptions, tasks } from "../../config/content";
import { historyDates } from "../../core/model";
export default function HistoryScreen() {
  const { state, theme, today } = useApp();
  const [selected, setSelected] = useState(today);
  const days = historyDates(state, recentDays());
  const dates = useRef<ScrollView>(null);
  const records = state.reports
    .filter((r) => r.day === selected)
    .slice()
    .reverse();
  const done = state.completed[selected] ?? [];
  return (
    <Screen>
      <Heading title="Ваши дни" body="Моменты, к которым можно вернуться" />
      <ScrollView
        ref={dates}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() =>
          dates.current?.scrollToEnd({ animated: false })
        }
        contentContainerStyle={{ gap: 8, paddingBottom: 22 }}
      >
        {days.map((day) => {
          const active = selected === day,
            recorded = state.memoryDays.includes(day);
          return (
            <Touch
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`История за ${dayLabel(day)}`}
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(day)}
              style={{
                width: 57,
                height: 152,
                borderRadius: 27,
                overflow: "hidden",
                borderWidth: active ? 2 : 1,
                borderColor: active ? theme.accent : theme.border,
              }}
            >
              <ImageBackground
                source={
                  theme.dark
                    ? require("../../../assets/images/shore-dark.png")
                    : require("../../../assets/images/shore-light.png")
                }
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 12,
                  gap: 4,
                }}
                resizeMode="cover"
              >
                <LinearGradient
                  pointerEvents="none"
                  colors={[theme.glass, "transparent"]}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 85,
                  }}
                />
                <T size={20} weight="500">
                  {Number(day.slice(-2))}
                </T>
                <T size={10}>
                  {new Date(day + "T12:00:00").toLocaleDateString("ru-RU", {
                    weekday: "short",
                  })}
                </T>
                {recorded && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 15,
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: theme.accent,
                      borderWidth: 1,
                      borderColor: theme.surface,
                    }}
                  />
                )}
              </ImageBackground>
            </Touch>
          );
        })}
      </ScrollView>
      <T size={23} weight="500" style={{ marginBottom: 18 }}>
        {selected === today ? "Сегодня" : dayLabel(selected)}
      </T>
      {records.length === 0 && done.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 25, gap: 15 }}>
          <Mascot size={155} />
          <T size={21} weight="500">
            Здесь пока тихо
          </T>
          <T muted size={14} style={{ textAlign: "center", marginBottom: 10 }}>
            Сохранённые моменты и выполненные дела появятся здесь.
          </T>
          <Button
            title="Записать, как я сейчас"
            icon="edit"
            onPress={() => router.push("/check-in")}
          />
        </View>
      ) : (
        <View style={{ gap: 13 }}>
          {records.map((record) => {
            const legacy = moodOptions.find((m) => m.id === record.mood)!;
            const label =
              record.label ||
              (record.feeling ? feelingAt(record.feeling).label : legacy.label);
            return (
              <Panel key={record.id} style={{ gap: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  {record.feeling ? (
                    <FeelingCharacter point={record.feeling} size={60} quiet />
                  ) : (
                    <MoodFace mood={record.mood} color={legacy.color} />
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <T size={18} weight="500">
                      {label}
                    </T>
                    <T size={11} muted>
                      Момент · {record.time}
                    </T>
                  </View>
                </View>
                {record.feeling && (
                  <T size={12} muted>
                    {feelingHint(record.feeling)}
                  </T>
                )}
                {record.note ? <T size={14}>{record.note}</T> : null}
                {record.sleep ? (
                  <T size={12} muted>
                    Сон · {record.sleep}
                  </T>
                ) : null}
              </Panel>
            );
          })}
          {done
            .filter((id) => id !== "checkin")
            .map((id) => (
              <Panel key={id} style={{ padding: 17 }}>
                <T size={14}>✓ {tasks.find((task) => task.id === id)?.title}</T>
                <T size={11} muted>
                  Отмечено в плане
                </T>
              </Panel>
            ))}
        </View>
      )}
      <View style={{ marginTop: 24, gap: 12 }}>
        <Button
          title={`Вопросы к приёму${state.questions.length ? " · " + state.questions.length : ""}`}
          secondary
          icon="edit"
          onPress={() => router.push("/questions")}
        />
        <T size={12} muted>
          Каждый день может быть разным. Ваши записи остаются с вами.
        </T>
      </View>
    </Screen>
  );
}
