import { useEffect, useRef, useState } from "react";
import {
  View,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useJourney } from "../../state/JourneyProvider";
import { Header, T, Button } from "../../components/UI";
import { Touch, Enter } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import { Mascot } from "../../components/Mascot";
import { useApp } from "../../state/AppProvider";
import { demoTransport, type ChatMessage } from "../../core/chat";
export default function ChatScreen() {
  const { theme } = useApp();
  const safe = useSafeAreaInsets();
  const { journey, act } = useJourney();
  const list = useRef<ScrollView>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const welcome: ChatMessage = {
    id: "welcome",
    role: "assistant",
    text: "Привет! Помогу найти план дня, самоотчёт или вопросы к приёму. Что посмотрим?",
  };
  const messages = journey?.chat?.length ? journey.chat : [welcome];
  const [pending, setPending] = useState<ChatMessage | null>(null);
  const [text, setText] = useState(journey?.chatDraft ?? "");
  useEffect(() => {
    const timer = setTimeout(() => void act({ type: "chat:draft", text }), 400);
    return () => clearTimeout(timer);
  }, [act, text]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [keyboard, setKeyboard] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    alive.current = true;
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      alive.current = false;
      show.remove();
      hide.remove();
    };
  }, []);
  async function send(value = text) {
    const trimmed = value.trim().slice(0, 1000);
    if (!trimmed || busy.current) return;
    busy.current = true;
    setSending(true);
    setError("");

    const next = [
      ...messages,
      { id: `u-${Date.now()}`, role: "user" as const, text: trimmed },
    ];
    setPending(next[next.length - 1]);
    try {
      const reply = await demoTransport.reply(trimmed, next);
      if (
        !(await act({
          type: "chat:append",
          messages: [
            next[next.length - 1],
            { id: `a-${Date.now()}`, role: "assistant", text: reply },
          ],
        }))
      )
        throw new Error("save");
      if (alive.current) setText("");
    } catch {
      if (alive.current)
        setError("Не получилось ответить. Попробуйте написать ещё раз.");
    } finally {
      if (alive.current) setPending(null);
      busy.current = false;
      if (alive.current) setSending(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.page, paddingTop: safe.top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingHorizontal: 24 }}>
        <Header title="Рядом" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginTop: 8,
            marginBottom: 14,
          }}
        >
          <Mascot size={48} />
          <View style={{ flex: 1 }}>
            <T muted size={12}>
              План, записи и вопросы
            </T>
          </View>
          <Touch
            accessibilityRole="button"
            accessibilityLabel="Меню переписки"
            accessibilityState={{ expanded: menu }}
            onPress={() => setMenu(!menu)}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T size={24}>···</T>
          </Touch>
        </View>
      </View>
      <ScrollView
        ref={list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          list.current?.scrollToEnd({ animated: true })
        }
        contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
      >
        {[...messages, ...(pending ? [pending] : [])].map((message) => (
          <Enter
            key={message.id}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "91%",
            }}
          >
            <View
              style={{
                padding: 18,
                borderRadius: 25,
                borderBottomRightRadius: message.role === "user" ? 7 : 25,
                borderBottomLeftRadius: message.role === "assistant" ? 7 : 25,
                backgroundColor:
                  message.role === "user" ? theme.accent : theme.surface,
                borderWidth: message.role === "assistant" ? 1 : 0,
                borderColor: theme.border,
              }}
            >
              <T
                size={14}
                style={{
                  color: message.role === "user" ? theme.onAccent : theme.text,
                  lineHeight: 21,
                }}
              >
                {message.role === "assistant"
                  ? message.text.replace(
                      /^Сообщения врачу пока не отправляются\. /,
                      "",
                    )
                  : message.text}
              </T>
            </View>
          </Enter>
        ))}
        {sending && (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <ActivityIndicator color={theme.accent} size="small" />
            <T size={12} muted>
              Спутник отвечает…
            </T>
          </View>
        )}
        {error ? (
          <>
            <T size={12}>{error}</T>
            <Button
              title="Повторить отправку"
              secondary
              onPress={() => void send()}
            />
          </>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            ["План", "/plan"],
            ["Самоотчёт", "/check-in"],
            ["Вопросы к приёму", "/questions"],
          ].map(([label, path]) => (
            <Touch
              key={path}
              accessibilityRole="button"
              onPress={() =>
                router.push(path as "/plan" | "/check-in" | "/questions")
              }
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: 14,
                backgroundColor: theme.soft,
              }}
            >
              <T size={12}>{label}</T>
            </Touch>
          ))}
        </View>
        {menu && (
          <View>
            <Button
              title="Очистить переписку"
              secondary
              onPress={() =>
                Alert.alert(
                  "Очистить переписку?",
                  "Записи терапии сохранятся.",
                  [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Очистить",
                      style: "destructive",
                      onPress: () =>
                        void act({ type: "chat:clear" }).then((ok) => {
                          if (ok) setText("");
                        }),
                    },
                  ],
                )
              }
            />
          </View>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: keyboard ? 12 : Math.max(safe.bottom, 12) + 82,
          gap: 12,
        }}
      >
        {messages.length === 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {["Что в плане?", "Как сделать запись?", "Как прошла ночь?"].map(
              (value) => (
                <Touch
                  key={value}
                  onPress={() => void send(value)}
                  accessibilityRole="button"
                  style={{
                    padding: 13,
                    borderRadius: 18,
                    backgroundColor: theme.soft,
                  }}
                >
                  <T size={11}>{value}</T>
                </Touch>
              ),
            )}
          </ScrollView>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            padding: 7,
            borderRadius: 27,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            gap: 5,
          }}
        >
          <TextInput
            editable={!sending}
            accessibilityLabel="Сообщение помощнику"
            value={text}
            onChangeText={setText}
            maxLength={1000}
            multiline
            placeholder="Напишите пару слов…"
            placeholderTextColor={theme.muted}
            style={{
              flex: 1,
              maxHeight: 100,
              minHeight: 44,
              paddingHorizontal: 12,
              paddingTop: 12,
              paddingBottom: 12,
              color: theme.text,
              fontFamily: "Onest",
              fontSize: 14,
            }}
          />
          <Touch
            disabled={sending || !text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Отправить сообщение"
            onPress={() => void send()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.accent,
              opacity: sending || !text.trim() ? 0.4 : 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="send" size={20} color={theme.onAccent} />
          </Touch>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
