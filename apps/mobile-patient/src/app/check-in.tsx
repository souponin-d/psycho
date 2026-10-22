import { useRef, useState } from "react";
import { View, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { Screen, T, Heading, Chip, Button, Panel } from "../components/UI";
import { Touch, Enter } from "../components/Motion";
import { Mascot } from "../components/Mascot";
import { MoodFace } from "../components/MoodFace";
import { moodOptions, dayLabel } from "../config/content";
import { useApp } from "../state/AppProvider";
import type { Mood } from "../core/model";
export default function CheckInScreen() {
  const { theme, dispatch, today } = useApp();
  const [mood, setMood] = useState<Mood>("neutral");
  const [sleep, setSleep] = useState("Обычно");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const current = moodOptions.find((item) => item.id === mood)!;
  function save() {
    if (saving.current) return;
    saving.current = true;
    const now = new Date();
    dispatch({
      type: "report",
      report: {
        id: `report-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
        day: today,
        time: now.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        mood,
        sleep,
        note: note.trim(),
      },
    });
    dispatch({ type: "complete", day: today, taskId: "checkin", done: true });
    setSaved(true);
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen title="Момент для себя" back>
        {saved ? (
          <Enter>
            <View style={{ alignItems: "center", paddingTop: 40, gap: 22 }}>
              <Mascot size={230} />
              <T
                size={33}
                weight="500"
                style={{ textAlign: "center", letterSpacing: -1 }}
              >
                Момент сохранён
              </T>
              <T muted size={15} style={{ textAlign: "center" }}>
                Спасибо за внимание к себе.{"\n"}Запись уже в истории этого
                телефона.
              </T>
            </View>
            <View style={{ gap: 12, marginTop: 36 }}>
              <Button
                title="В мой день"
                onPress={() => router.dismissTo("/")}
              />
              <Button
                title="Посмотреть историю"
                secondary
                icon="history"
                onPress={() => router.dismissTo("/history")}
              />
            </View>
          </Enter>
        ) : (
          <>
            <Heading
              title="Как вы себя\nчувствуете?"
              body={`${dayLabel()} · здесь нет правильных ответов`}
            />
            <View style={{ alignItems: "center", marginTop: -8 }}>
              <Mascot size={140} />
              <T size={24} weight="500" style={{ marginTop: 10 }}>
                {current.label}
              </T>
              <T size={13} muted style={{ marginTop: 5 }}>
                {current.hint}
              </T>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 2,
                marginTop: 24,
                marginBottom: 28,
              }}
            >
              {moodOptions.map((item) => (
                <View key={item.id} style={{ flex: 1 }}>
                  <Touch
                    accessibilityRole="button"
                    accessibilityLabel={`Самочувствие: ${item.label}`}
                    accessibilityState={{ selected: mood === item.id }}
                    onPress={() => setMood(item.id)}
                    style={{
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: 24,
                      backgroundColor:
                        mood === item.id ? theme.soft : "transparent",
                      borderWidth: 1,
                      borderColor:
                        mood === item.id ? theme.accent : "transparent",
                      gap: 8,
                    }}
                  >
                    <MoodFace mood={item.id} color={item.color} size={39} />
                    <T size={9} weight={mood === item.id ? "600" : "400"}>
                      {item.label}
                    </T>
                  </Touch>
                </View>
              ))}
            </View>
            <Panel style={{ gap: 14, marginBottom: 22 }}>
              <T size={16} weight="500">
                Как прошла ночь?
              </T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {["Плохо", "Обычно", "Хорошо"].map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    active={sleep === label}
                    onPress={() => setSleep(label)}
                  />
                ))}
              </View>
            </Panel>
            <T size={14} weight="500" style={{ marginBottom: 10 }}>
              Пара слов о себе{" "}
              <T muted size={12}>
                · необязательно
              </T>
            </T>
            <TextInput
              accessibilityLabel="Заметка о самочувствии"
              multiline
              value={note}
              onChangeText={setNote}
              maxLength={500}
              placeholder="Что хочется запомнить об этом моменте?"
              placeholderTextColor={theme.muted}
              textAlignVertical="top"
              style={{
                minHeight: 110,
                backgroundColor: theme.surface,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 18,
                color: theme.text,
                fontFamily: "Onest",
                fontSize: 15,
              }}
            />
            <T
              size={10}
              muted
              style={{ textAlign: "right", marginTop: 5, marginBottom: 18 }}
            >
              {note.length}/500
            </T>
            <Button title="Сохранить момент" icon="check" onPress={save} />
            <T size={11} muted style={{ marginTop: 16, textAlign: "center" }}>
              Демонстрационная запись. Врачу не отправляется.
            </T>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
