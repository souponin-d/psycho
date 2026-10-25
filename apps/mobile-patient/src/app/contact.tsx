import { useEffect, useRef, useState } from "react";
import { Alert, View, TextInput } from "react-native";
import { router } from "expo-router";
import { Screen, Heading, T, Button, Chip } from "../components/UI";
import { useJourney } from "../state/JourneyProvider";
import { useApp } from "../state/AppProvider";
import { getContactDraft, validateContactDraft } from "../core/contactDraft";
import { shiftDay } from "../core/calendar";
import type { ContactDraftFields, ContactEvent } from "../core/journeyModel";
export default function ContactScreen() {
  const { theme, today } = useApp(),
    { journey, act, saving } = useJourney();
  const draftId = "contact:" + today;
  const [fields, setFields] = useState<ContactDraftFields>(() =>
    getContactDraft(journey?.drafts[draftId]),
  );
  const [customDate, setCustomDate] = useState(
    () =>
      !!fields.onset &&
      fields.onset !== today &&
      fields.onset !== shiftDay(today, -1),
  );
  const [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  const committed = useRef(false),
    inFlight = useRef(false),
    latest = useRef(fields);
  latest.current = fields;
  const hasContent = !!(
    fields.description ||
    fields.onset ||
    fields.severity ||
    fields.preference
  );
  const invalid = validateContactDraft(fields, today);
  useEffect(() => {
    if (saved || !hasContent) return;
    const timer = setTimeout(() => {
      if (!committed.current)
        void act({
          type: "draft",
          draft: {
            id: draftId,
            kind: "contact",
            day: today,
            contact: latest.current,
          },
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [fields, saved, hasContent, act, draftId, today]);
  useEffect(
    () => () => {
      const f = latest.current;
      if (
        !committed.current &&
        (f.description || f.onset || f.severity || f.preference)
      )
        void act({
          type: "draft",
          draft: { id: draftId, kind: "contact", day: today, contact: f },
        });
    },
    [act, draftId, today],
  );
  const patch = (value: Partial<ContactDraftFields>) => {
    setError("");
    setFields((f) => ({ ...f, ...value }));
  };
  async function save() {
    if (inFlight.current) return;
    const message = validateContactDraft(fields, today);
    if (message || !fields.severity || !fields.preference) {
      setError(message ?? "Выберите ответы.");
      return;
    }
    inFlight.current = true;
    const draftSaved = await act({
      type: "draft",
      draft: { id: draftId, kind: "contact", day: today, contact: fields },
    });
    if (!draftSaved) {
      inFlight.current = false;
      setError("Не удалось сохранить черновик. Ваш ввод остался здесь.");
      return;
    }
    committed.current = true;
    const success = await act({
      type: "event",
      event: {
        id: "contact-" + Date.now(),
        kind: "contact",
        day: today,
        onset: fields.onset,
        description: fields.description.trim(),
        severity: fields.severity,
        preference: fields.preference,
      },
    });
    inFlight.current = false;
    if (success) setSaved(true);
    else {
      committed.current = false;
      setError("Не удалось сохранить обращение. Ваш ввод остался здесь.");
    }
  }
  const inputStyle = {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    padding: 18,
    fontFamily: "Onest",
    fontSize: 16,
    color: theme.text,
  };
  return (
    <Screen title="Обращение" back>
      <Heading
        title={saved ? "Обращение сохранено" : "Что хотите обсудить?"}
        body={
          saved
            ? "Запись осталась в вашей истории."
            : "Опишите трудность и выберите, как хотите её обсудить."
        }
      />
      {saved ? (
        <View style={{ gap: 22 }}>
          <T>
            Обращение сохранено на этом телефоне. Реальная отправка врачу пока
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
            value={fields.description}
            onChangeText={(description) => patch({ description })}
            maxLength={1000}
            placeholder="Что произошло?"
            placeholderTextColor={theme.muted}
            style={{ ...inputStyle, minHeight: 140, textAlignVertical: "top" }}
          />
          <T size={16} weight="500">
            Когда началось?
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip
              label="Сегодня"
              active={!customDate && fields.onset === today}
              onPress={() => {
                setCustomDate(false);
                patch({ onset: today });
              }}
            />
            <Chip
              label="Вчера"
              active={!customDate && fields.onset === shiftDay(today, -1)}
              onPress={() => {
                setCustomDate(false);
                patch({ onset: shiftDay(today, -1) });
              }}
            />
            <Chip
              label="Другая дата"
              active={customDate}
              onPress={() => {
                setCustomDate(true);
                patch({ onset: "" });
              }}
            />
          </View>
          {customDate && (
            <View style={{ gap: 8 }}>
              <T muted size={12}>
                Укажите дату в формате ДД.ММ.ГГГГ, например 20.10.2026.
              </T>
              <TextInput
                accessibilityLabel="Дата начала трудности"
                value={fields.onset.split("-").reverse().join(".")}
                onChangeText={(text) =>
                  patch({ onset: text.split(".").reverse().join("-") })
                }
                maxLength={10}
                keyboardType="numbers-and-punctuation"
                placeholder="ДД.ММ.ГГГГ"
                placeholderTextColor={theme.muted}
                style={inputStyle}
              />
            </View>
          )}
          <T size={16} weight="500">
            Насколько это мешает?
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              ["Лёгкая", "Заметная", "Сильная"] as ContactEvent["severity"][]
            ).map((severity) => (
              <Chip
                key={severity}
                label={severity}
                active={fields.severity === severity}
                onPress={() => patch({ severity })}
              />
            ))}
          </View>
          <T size={16} weight="500">
            Как хотите обсудить?
          </T>
          <View style={{ gap: 10 }}>
            <Chip
              label="Дождусь планового приёма"
              active={fields.preference === "planned"}
              onPress={() => patch({ preference: "planned" })}
            />
            <Chip
              label="Хочу связаться раньше"
              active={fields.preference === "earlier"}
              onPress={() => patch({ preference: "earlier" })}
            />
          </View>
          {(!!error || !!invalid) && (
            <T
              size={12}
              muted={!error}
              accessibilityRole={error ? "alert" : undefined}
            >
              {error || invalid}
            </T>
          )}
          <Button
            title="Сохранить обращение"
            disabled={!!invalid || saving}
            onPress={() => void save()}
          />
          {hasContent && (
            <Button
              title="Очистить черновик"
              secondary
              onPress={() =>
                Alert.alert(
                  "Очистить черновик?",
                  "Несохранённое описание и выбранные ответы будут удалены.",
                  [
                    { text: "Оставить", style: "cancel" },
                    {
                      text: "Очистить",
                      style: "destructive",
                      onPress: () => {
                        latest.current = { description: "", onset: "" };
                        setFields(latest.current);
                        setCustomDate(false);
                        setError("");
                        void act({ type: "draft:remove", id: draftId });
                      },
                    },
                  ],
                )
              }
            />
          )}
          <T size={12} muted>
            Черновик сохраняется на этом телефоне. Это моделируемое обращение:
            приложение не меняет назначение и не обеспечивает срочный ответ
            врача.
          </T>
        </View>
      )}
    </Screen>
  );
}
