import { useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  View,
} from "react-native";
import { Screen, T, Button, Panel } from "../components/UI";
import { Touch } from "../components/Motion";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { dayKey, dayLabel } from "../config/content";
import { useFeedback } from "../hooks/useFeedback";
export default function QuestionsScreen() {
  const { act } = useJourney();
  const { state, dispatch, theme } = useApp(),
    { pulse } = useFeedback();
  const [text, setText] = useState("");
  function add() {
    const value = text.trim();
    if (!value || state.questions.length >= 40) return;
    dispatch({
      type: "question:add",
      question: {
        id: `question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: value,
        day: dayKey(),
      },
    });
    setText("");
    void act({ type: "activity", activity: "question" });
    Keyboard.dismiss();
    pulse(true);
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen back title="Вопросы к приёму">
        <T
          size={33}
          weight="500"
          style={{ letterSpacing: -1, marginTop: 20, marginBottom: 12 }}
        >
          Чтобы не забыть важное
        </T>
        <T muted size={14} style={{ marginBottom: 24 }}>
          Запишите мысль сейчас и вернитесь к ней перед встречей.
        </T>
        <TextInput
          accessibilityLabel="Новый вопрос к приёму"
          value={text}
          onChangeText={setText}
          maxLength={240}
          multiline
          placeholder="Что хочется обсудить с врачом?"
          placeholderTextColor={theme.muted}
          textAlignVertical="top"
          style={{
            minHeight: 120,
            fontFamily: "Onest",
            fontSize: 17,
            color: theme.text,
            padding: 18,
            backgroundColor: theme.soft,
            borderRadius: 22,
          }}
        />
        <T muted size={11} style={{ marginVertical: 10 }}>
          {text.length}/240 · {state.questions.length}/40 вопросов
        </T>
        <Button
          title="Сохранить вопрос"
          icon="check"
          disabled={!text.trim() || state.questions.length >= 40}
          onPress={add}
        />
        {state.questions.length === 0 ? (
          <Panel style={{ marginTop: 25, gap: 8 }}>
            <Icon name="edit" size={30} color={theme.accent} />
            <T size={18}>Здесь появятся ваши вопросы</T>
            <T muted size={13}>
              Они останутся на этом телефоне. Можно показать список на приёме.
            </T>
          </Panel>
        ) : (
          <View style={{ marginTop: 24, gap: 12 }}>
            {state.questions
              .slice()
              .reverse()
              .map((q) => (
                <Panel
                  key={q.id}
                  style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
                >
                  <View style={{ flex: 1, gap: 8 }}>
                    <T size={16}>{q.text}</T>
                    <T muted size={11}>
                      {dayLabel(q.day)}
                    </T>
                  </View>
                  <Touch
                    accessibilityRole="button"
                    accessibilityLabel={`Удалить вопрос: ${q.text}`}
                    onPress={() =>
                      Alert.alert(
                        "Удалить вопрос?",
                        "Он исчезнет из вашего списка.",
                        [
                          { text: "Оставить", style: "cancel" },
                          {
                            text: "Удалить",
                            style: "destructive",
                            onPress: () =>
                              dispatch({ type: "question:remove", id: q.id }),
                          },
                        ],
                      )
                    }
                    style={{
                      width: 44,
                      height: 44,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Icon name="close" color={theme.muted} size={19} />
                  </Touch>
                </Panel>
              ))}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
