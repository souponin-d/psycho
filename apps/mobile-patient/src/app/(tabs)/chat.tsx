import { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, T } from "../../components/UI";
import { Touch, Enter } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import { Mascot } from "../../components/Mascot";
import { useApp } from "../../state/AppProvider";
import { demoTransport, type ChatMessage } from "../../core/chat";
export default function ChatScreen() {
  const { theme } = useApp();
  const safe = useSafeAreaInsets();
  const list = useRef<ScrollView>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Привет! Я ваш спутник в Синкли. Помогу сориентироваться в плане или оставить момент для себя. Что посмотрим?",
    },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [keyboard, setKeyboard] = useState(false);
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
    setText("");
    const next = [
      ...messages,
      { id: `u-${Date.now()}`, role: "user" as const, text: trimmed },
    ];
    setMessages(next);
    try {
      const reply = await demoTransport.reply(trimmed, next);
      if (alive.current)
        setMessages((items) => [
          ...items,
          { id: `a-${Date.now()}`, role: "assistant", text: reply },
        ]);
    } catch {
      if (alive.current)
        setError("Не получилось ответить. Попробуйте написать ещё раз.");
    } finally {
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
        <Header />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginTop: 8,
            marginBottom: 14,
          }}
        >
          <Mascot size={75} />
          <View>
            <T size={27} weight="500" style={{ letterSpacing: -1 }}>
              Я рядом
            </T>
            <T muted size={12}>
              Ваш демонстрационный помощник
            </T>
          </View>
        </View>
        <View
          style={{ backgroundColor: theme.soft, borderRadius: 15, padding: 12 }}
        >
          <T size={11} muted>
            Демо-ответы · без AI и связи с врачом.{"\n"}Не вводите настоящие
            медицинские данные.
          </T>
        </View>
      </View>
      <ScrollView
        ref={list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          list.current?.scrollToEnd({ animated: true })
        }
        contentContainerStyle={{ padding: 24, gap: 14, flexGrow: 1 }}
      >
        {messages.map((message) => (
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
                {message.text}
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
        {error ? <T size={12}>{error}</T> : null}
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
