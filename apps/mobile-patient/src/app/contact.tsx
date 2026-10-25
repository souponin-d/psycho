import { useState } from "react";
import { View, TextInput } from "react-native";
import { router } from "expo-router";
import { Screen, Heading, T, Button, Chip } from "../components/UI";
import { useJourney } from "../state/JourneyProvider";
import { useApp } from "../state/AppProvider";
import type { ContactEvent } from "../core/journeyModel";
export default function ContactScreen() {
  const { theme, today } = useApp(),
    { act, saving } = useJourney();
  const [text, setText] = useState(""),
    [severity, setSeverity] = useState<ContactEvent["severity"]>("Лёгкая"),
    [preference, setPreference] = useState<"planned" | "earlier">("planned"),
    [saved, setSaved] = useState(false);
  async function save() {
    const success = await act({
      type: "event",
      event: {
        id: "contact-" + Date.now(),
        kind: "contact",
        day: today,
        onset: today,
        description: text.trim(),
        severity,
        preference,
      },
    });
    if (success) setSaved(true);
  }
  return (
    <Screen title="Обращение" back>
      <Heading
        title={saved ? "Обращение сохранено" : "Как переносится терапия?"}
        body={
          saved
            ? "Запись осталась в вашей истории."
            : "Опишите трудность, которую хотите обсудить."
        }
      />
      {saved ? (
        <View style={{ gap: 22 }}>
          <T>
            Обращение сохранено в сценарии. Реальная отправка врачу пока
            недоступна.
          </T>
          <Button
            title="Вернуться к плану"
            onPress={() => router.dismissTo("/plan")}
          />
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          <TextInput
            accessibilityLabel="Описание трудности"
            multiline
            value={text}
            onChangeText={setText}
            maxLength={1000}
            placeholder="Что произошло и когда вы это заметили?"
            placeholderTextColor={theme.muted}
            style={{
              minHeight: 155,
              textAlignVertical: "top",
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 23,
              padding: 20,
              fontFamily: "Onest",
              fontSize: 16,
              color: theme.text,
            }}
          />
          <T size={16}>Насколько это мешает?</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["Лёгкая", "Заметная", "Сильная"] as const).map((value) => (
              <Chip
                key={value}
                label={value}
                active={severity === value}
                onPress={() => setSeverity(value)}
              />
            ))}
          </View>
          <T size={16}>Как хотите обсудить?</T>
          <View style={{ gap: 10 }}>
            <Chip
              label="Дождусь планового приёма"
              active={preference === "planned"}
              onPress={() => setPreference("planned")}
            />
            <Chip
              label="Хочу связаться раньше"
              active={preference === "earlier"}
              onPress={() => setPreference("earlier")}
            />
          </View>
          <Button
            title="Сохранить обращение"
            disabled={!text.trim() || saving}
            onPress={() => void save()}
          />
          <T size={12} muted>
            Это модельный маршрут. Приложение не меняет назначение и не
            обеспечивает срочный ответ врача.
          </T>
        </View>
      )}
    </Screen>
  );
}
