import { useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Header, T, Button } from "../components/UI";
import { Touch } from "../components/Motion";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppProvider";
import { usePatientConnection } from "../state/PatientConnectionProvider";
import { chatRows } from "../core/patientChatView";
import { MessageQueuedError } from "../core/patientMessageSync";

export default function DoctorChat() {
  const { theme } = useApp();
  const safe = useSafeAreaInsets();
  const connection = usePatientConnection();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scroll = useRef<ScrollView>(null);
  const outgoing = useRef<{ id: string; text: string } | null>(null);
  const rows = chatRows(
    connection.snapshot?.messages ?? [],
    connection.pendingMessages,
  );
  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const command =
      outgoing.current?.text === trimmed
        ? outgoing.current
        : {
            id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            text: trimmed,
          };
    outgoing.current = command;
    setSending(true);
    setError("");
    try {
      await connection.send(command.text, command.id);
      setText("");
      outgoing.current = null;
    } catch (e) {
      if (e instanceof MessageQueuedError) {
        setText("");
        outgoing.current = null;
      } else {
        setError(
          e instanceof Error ? e.message : "Не удалось отправить сообщение",
        );
      }
    } finally {
      setSending(false);
    }
  }
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.page,
        paddingTop: safe.top,
        paddingHorizontal: 24,
      }}
    >
      <Header title="Связь с врачом" back />
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: false })
        }
      >
        {rows.length === 0 && (
          <T muted>Здесь появятся ваши сообщения и ответы врача.</T>
        )}
        {rows.map((row) => {
          const mine = row.direction === "patient";
          const time =
            row.createdAt && !Number.isNaN(Date.parse(row.createdAt))
              ? new Date(row.createdAt).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
          const state =
            row.state === "pending"
              ? "Ожидает отправки"
              : row.state === "read"
                ? "Прочитано"
                : row.state === "delivered"
                  ? "Доставлено"
                  : "Отправлено на сервер";
          return (
            <View
              key={row.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "88%",
                gap: 5,
              }}
            >
              <View
                style={{
                  backgroundColor: mine ? theme.tint : theme.surface,
                  borderColor: theme.border,
                  borderWidth: 1,
                  borderRadius: 20,
                  padding: 16,
                }}
              >
                {!mine && (
                  <T size={12} weight="600">
                    Врач
                  </T>
                )}
                <T size={15}>{row.text}</T>
              </View>
              <T size={11} muted style={{ textAlign: mine ? "right" : "left" }}>
                {[time, mine ? state : ""].filter(Boolean).join(" · ")}
              </T>
            </View>
          );
        })}
        <Button
          title="Новое обращение"
          secondary
          icon="message"
          onPress={() => router.push("/contact")}
        />
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingTop: 12,
          paddingBottom: Math.max(safe.bottom, 12),
          gap: 8,
        }}
      >
        {error ? (
          <T size={12} muted accessibilityRole="alert">
            {error}
          </T>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TextInput
            accessibilityLabel="Напишите сообщение"
            placeholder="Напишите сообщение"
            placeholderTextColor={theme.muted}
            multiline
            maxLength={20000}
            value={text}
            onChangeText={setText}
            style={{
              flex: 1,
              minHeight: 50,
              maxHeight: 120,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              color: theme.text,
              fontFamily: "Onest",
              fontSize: 15,
            }}
          />
          <Touch
            accessibilityRole="button"
            accessibilityLabel="Отправить сообщение"
            accessibilityState={{ disabled: !text.trim() || sending }}
            disabled={!text.trim() || sending}
            onPress={() => void send()}
            style={{
              width: 50,
              height: 50,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.accent,
              opacity: !text.trim() || sending ? 0.45 : 1,
            }}
          >
            <Icon name="arrow" color={theme.onAccent} size={22} />
          </Touch>
        </View>
      </View>
    </View>
  );
}
