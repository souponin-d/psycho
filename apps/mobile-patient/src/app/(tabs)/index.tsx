import { View } from "react-native";
import { router } from "expo-router";
import { Screen, T, Button, Panel } from "../../components/UI";
import { Icon } from "../../components/Icon";
import { DayLandscape } from "../../components/DayLandscape";
import { useApp } from "../../state/AppProvider";
import { dayLabel, tasks } from "../../config/content";
export default function TodayScreen() {
  const { state, theme, dispatch, today } = useApp();
  const done = state.completed[today] ?? [];
  const next = tasks.find((task) => !done.includes(task.id));
  const hasReport = state.reports.some((report) => report.day === today);
  return (
    <Screen>
      <View style={{ marginTop: 10, marginBottom: 22, gap: 6 }}>
        <T muted size={13}>
          {dayLabel()} · ваш день
        </T>
        <T
          size={38}
          weight="500"
          style={{ letterSpacing: -1.6, lineHeight: 42 }}
        >
          Доброе утро,{"\n"}
          {state.name}
        </T>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 6,
          }}
        >
          <View
            style={{
              width: 40,
              height: 3,
              borderRadius: 3,
              backgroundColor: theme.border,
            }}
          >
            <View
              style={{
                width: `${(done.length / tasks.length) * 100}%`,
                height: 3,
                borderRadius: 3,
                backgroundColor: theme.accent,
              }}
            />
          </View>
          <T size={11} muted>
            {done.length} из {tasks.length} маленьких дел
          </T>
        </View>
      </View>
      <DayLandscape />
      <View style={{ marginTop: 18, gap: 12 }}>
        <Button
          title={
            hasReport ? "Ещё один момент для себя" : "Как вы себя чувствуете?"
          }
          icon="heart"
          onPress={() => router.push("/check-in")}
        />
        <Panel style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.soft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={next?.icon ?? "check"} color={theme.text} />
          </View>
          <View style={{ flex: 1 }}>
            <T size={11} muted>
              {next ? "Ближайшее в плане" : "На сегодня всё отмечено"}
            </T>
            <T size={16} weight="500">
              {next
                ? `${next.id === "morning" ? state.morning : next.time} · ${next.title}`
                : "Спасибо за внимание к себе"}
            </T>
          </View>
        </Panel>
        {next && (
          <Button
            secondary
            title={
              next.id === "checkin" ? "Сделать запись" : "Отметить выполненное"
            }
            icon="check"
            onPress={() =>
              next.id === "checkin"
                ? router.push("/check-in")
                : dispatch({
                    type: "complete",
                    day: today,
                    taskId: next.id,
                    done: true,
                  })
            }
          />
        )}
        <T size={11} muted style={{ textAlign: "center", marginTop: 8 }}>
          Демо-план. Отметки остаются на этом телефоне.
        </T>
      </View>
    </Screen>
  );
}
