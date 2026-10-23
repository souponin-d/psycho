import { useRef, useState } from "react";
import { View, ScrollView } from "react-native";
import { router } from "expo-router";
import { Screen, T, Heading, Panel, Button } from "../../components/UI";
import { Touch } from "../../components/Motion";
import { Mascot } from "../../components/Mascot";
import { MoodFace } from "../../components/MoodFace";
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
        onContentSizeChange={() =>
          dates.current?.scrollToEnd({ animated: false })
        }
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 9, paddingBottom: 20 }}
      >
        {days.map((day) => {
          const active = selected === day;
          const recorded = state.reports.some((r) => r.day === day);
          return (
            <Touch
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`История за ${dayLabel(day)}`}
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(day)}
              style={{
                width: 57,
                minHeight: 100,
                borderRadius: 29,
                backgroundColor: active ? theme.accent : theme.soft,
                alignItems: "center",
                paddingVertical: 15,
                gap: 8,
              }}
            >
              <T
                size={11}
                style={{ color: active ? theme.onAccent : theme.muted }}
              >
                {new Date(`${day}T12:00:00`).toLocaleDateString("ru-RU", {
                  weekday: "short",
                })}
              </T>
              <T
                size={21}
                weight="500"
                style={{ color: active ? theme.onAccent : theme.text }}
              >
                {Number(day.slice(-2))}
              </T>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: recorded
                    ? active
                      ? theme.onAccent
                      : theme.accent
                    : "transparent",
                }}
              />
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
            Сохранённые моменты и выполненные дела{"\n"}будут появляться здесь.
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
            const mood = moodOptions.find((m) => m.id === record.mood)!;
            return (
              <Panel key={record.id} style={{ gap: 15 }}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 13,
                    alignItems: "center",
                  }}
                >
                  <MoodFace mood={record.mood} color={mood.color} />
                  <View style={{ flex: 1 }}>
                    <T size={18} weight="500">
                      {mood.label}
                    </T>
                    <T size={11} muted>
                      Самоотчёт · {record.time}
                    </T>
                  </View>
                </View>
                {record.note ? <T size={14}>{record.note}</T> : null}
                <T size={12} muted>
                  Сон · {record.sleep}
                </T>
              </Panel>
            );
          })}
          {done
            .filter((id) => id !== "checkin")
            .map((id) => (
              <Panel key={id} style={{ padding: 17 }}>
                <T size={14}>✓ {tasks.find((task) => task.id === id)?.title}</T>
                <T size={11} muted>
                  Отмечено в демо-плане
                </T>
              </Panel>
            ))}
        </View>
      )}
      <View
        style={{
          marginTop: 28,
          paddingTop: 20,
          borderTopWidth: 1,
          borderColor: theme.border,
        }}
      >
        <T size={12} muted>
          История хранится локально. Оценок, серий и соревнования здесь нет —
          только ваш ритм.
        </T>
      </View>
    </Screen>
  );
}
