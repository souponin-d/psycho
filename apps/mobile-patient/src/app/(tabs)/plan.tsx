import { useState } from "react";
import { View, Modal, Image, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Screen, T, Heading, Button, RoundButton } from "../../components/UI";
import { Touch, Enter } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import { Mascot } from "../../components/Mascot";
import { useApp } from "../../state/AppProvider";
import { dayLabel, tasks } from "../../config/content";
import { planOperation } from "../../core/model";
export default function PlanScreen() {
  const { state, dispatch, theme, today, reducedMotion } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const safe = useSafeAreaInsets();
  const done = state.completed[today] ?? [];
  const task = tasks.find((item) => item.id === selected);
  function toggle() {
    if (!task) return;
    if (planOperation(task.id, done.includes(task.id)) === "report") {
      setSelected(null);
      router.push("/check-in");
    } else {
      dispatch({
        type: "complete",
        day: today,
        taskId: task.id,
        done: !done.includes(task.id),
      });
      setSelected(null);
    }
  }
  return (
    <>
      <Screen>
        <Heading
          title="План на сегодня"
          body={`${dayLabel()} · без спешки, шаг за шагом`}
        />
        <View
          style={{
            height: 145,
            borderRadius: 28,
            overflow: "hidden",
            marginBottom: 28,
          }}
        >
          <Image
            source={theme.landscape}
            style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
            resizeMode="cover"
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: theme.dark
                  ? "rgba(16,39,32,0.2)"
                  : "rgba(246,245,237,0.22)",
              },
            ]}
          />
          <View style={{ position: "absolute", left: 22, top: 24 }}>
            <T size={25} weight="500">
              В своём ритме
            </T>
            <T size={12} style={{ marginTop: 7 }}>
              {done.length} из 4 дел отмечено
            </T>
          </View>
          <View style={{ position: "absolute", right: 12, top: 17 }}>
            <Mascot size={110} />
          </View>
        </View>
        {tasks.map((item, index) => (
          <Enter key={item.id} delay={index * 70}>
            <Touch
              accessibilityRole="button"
              accessibilityLabel={`${item.time}, ${item.title}, ${done.includes(item.id) ? "выполнено" : "открыть"}`}
              onPress={() => setSelected(item.id)}
              style={{
                flexDirection: "row",
                gap: 16,
                paddingBottom: 27,
                minHeight: 118,
              }}
            >
              <View style={{ alignItems: "center", width: 46 }}>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 24,
                    backgroundColor: done.includes(item.id)
                      ? theme.accent
                      : index % 2
                        ? theme.context
                        : theme.tint,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name={done.includes(item.id) ? "check" : item.icon}
                    color={
                      done.includes(item.id)
                        ? theme.onAccent
                        : theme.dark && index % 2
                          ? "#26372D"
                          : theme.text
                    }
                    size={21}
                  />
                </View>
                {index < 3 && (
                  <View
                    style={{
                      width: 1,
                      flex: 1,
                      backgroundColor: theme.border,
                      marginTop: 7,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1, paddingTop: 1, gap: 4 }}>
                <T size={12} muted>
                  {item.period} ·{" "}
                  {item.id === "morning" ? state.morning : item.time}
                </T>
                <T
                  size={19}
                  weight="500"
                  style={{
                    textDecorationLine: done.includes(item.id)
                      ? "line-through"
                      : "none",
                    opacity: done.includes(item.id) ? 0.65 : 1,
                  }}
                >
                  {item.title}
                </T>
                <T muted size={12}>
                  {item.subtitle}
                </T>
              </View>
              <Icon name="arrow" size={18} color={theme.muted} />
            </Touch>
          </Enter>
        ))}
        <T size={11} muted>
          Отмечайте события в своём ритме. Вопросы о назначениях можно сохранить
          к следующему приёму.
        </T>
      </Screen>
      <Modal
        visible={Boolean(task)}
        transparent
        animationType={reducedMotion ? "none" : "slide"}
        onRequestClose={() => setSelected(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(5,19,14,0.45)",
          }}
        >
          <View
            style={{
              backgroundColor: theme.page,
              borderTopLeftRadius: 38,
              borderTopRightRadius: 38,
              maxHeight: "85%",
              paddingBottom: safe.bottom + 24,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 28, gap: 18 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 4,
                    backgroundColor: theme.border,
                  }}
                />
                <RoundButton
                  icon="close"
                  label="Закрыть событие"
                  onPress={() => setSelected(null)}
                />
              </View>
              <T size={58} weight="500" style={{ letterSpacing: -2 }}>
                {task?.id === "morning" ? state.morning : task?.time}
              </T>
              <T size={27} weight="500">
                {task?.title}
              </T>
              <T muted size={14}>
                {task?.subtitle}
              </T>
              <View style={{ alignItems: "center" }}>
                <Mascot size={135} />
              </View>
              <Button
                title={
                  task && done.includes(task.id)
                    ? "Снять отметку"
                    : task?.id === "checkin"
                      ? "Записать самочувствие"
                      : "Отметить выполненное"
                }
                icon="check"
                onPress={toggle}
              />
              <Button
                secondary
                title="Вернуться позже"
                icon="back"
                onPress={() => setSelected(null)}
              />
              <T size={11} muted style={{ textAlign: "center" }}>
                Отметка сохранится только на этом телефоне.
              </T>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
