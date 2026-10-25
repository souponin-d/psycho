import { useCallback, useEffect, useRef, useState } from "react";
import { Companion } from "../components/Companion";
import {
  View,
  TextInput,
  Modal,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T, Button } from "../components/UI";
import { ReportFieldsEditor } from "../components/ReportFieldsEditor";
import { useJourney } from "../state/JourneyProvider";
import { latestReports } from "../core/questionnaires";
import { fieldComplete, planForDay } from "../core/therapy";
import type { PatientDraft, ReportFields } from "../core/journeyModel";
import { Touch, Enter } from "../components/Motion";
import { Icon } from "../components/Icon";
import { FeelingCharacter } from "../components/FeelingCharacter";
import { FeelingBackdrop } from "../components/FeelingBackdrop";
import { FeelingGrid } from "../components/FeelingGrid";
import { useApp } from "../state/AppProvider";
import { useFeedback } from "../hooks/useFeedback";
import { feelingAt, feelingHint, type FeelingPoint } from "../core/feelings";
import { dayKey, moodOptions } from "../config/content";
export default function CheckInScreen() {
  const { theme, today } = useApp();
  const { journey, act, saving: persisting } = useJourney();
  const params = useLocalSearchParams<{
    day?: string;
    reportId?: string;
    personal?: string;
  }>();
  const day = params.day ?? dayKey();
  const requiredFields = journey ? planForDay(journey, day).reportFields : [];
  const existing =
    journey && params.reportId
      ? latestReports(journey, day).find(
          (r) => (r.entityId ?? r.id) === params.reportId,
        )
      : undefined;
  const legacy = params.reportId?.startsWith("legacy:")
    ? journey?.legacyArchive.find((r) => r.id === params.reportId!.slice(7))
    : undefined;
  const initialFields: ReportFields =
    existing?.fields ??
    (legacy
      ? {
          sleep: legacy.sleep,
          ...(legacy.feeling ? { feeling: legacy.feeling } : {}),
        }
      : {});
  const required =
    existing?.required ??
    (!legacy &&
      day >= (journey?.plan.startedAt ?? day) &&
      params.personal !== "1");
  const draftKey = params.reportId
    ? "edit:" + params.reportId
    : (required ? "report:" : "moment:") + day;
  const draft = journey?.drafts[draftKey];
  const profileReady = !!journey;
  const safe = useSafeAreaInsets(),
    dimensions = useWindowDimensions(),
    { pulse } = useFeedback();
  const [point, setPoint] = useState<FeelingPoint | null>(
    draft?.fields?.feeling ?? initialFields.feeling ?? null,
  );
  const [label, setLabel] = useState(
      draft?.label ??
        existing?.label ??
        legacy?.label ??
        (legacy ? moodOptions.find((m) => m.id === legacy.mood)?.label : "") ??
        "",
    ),
    [fields, setFields] = useState<ReportFields>(
      draft?.fields ?? initialFields,
    ),
    [note, setNote] = useState(
      draft?.note ?? existing?.note ?? legacy?.note ?? "",
    );
  const [panel, setPanel] = useState<"note" | "controls" | null>(
    legacy ? "note" : null,
  );
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const savedRef = useRef(false);
  const draftRef = useRef<PatientDraft | null>(null);
  draftRef.current = {
    id: draftKey,
    kind: "report",
    day,
    fields: { ...fields, ...(point ? { feeling: point } : {}) },
    note,
    label,
  };
  useEffect(() => {
    if (saved || !profileReady) return;
    const timer = setTimeout(() => {
      if (draftRef.current)
        void act({ type: "draft", draft: draftRef.current });
    }, 350);
    return () => clearTimeout(timer);
  }, [point, fields, note, label, saved, act, profileReady]);
  useEffect(
    () => () => {
      if (!savedRef.current && draftRef.current)
        void act({ type: "draft", draft: draftRef.current });
    },
    [act],
  );
  const choose = useCallback((next: FeelingPoint) => {
    setPoint(next);
  }, []);
  const preview = point ?? { valence: 3, energy: 3 },
    feeling = feelingAt(preview);
  const available = dimensions.height - safe.top - safe.bottom,
    size = Math.min(dimensions.width * 0.9, available * 0.44);
  const ink = theme.dark ? "#FFF7E9" : theme.text,
    muted = theme.dark ? "#C5BEC8" : theme.muted;
  async function save() {
    if ((!point && !legacy) || saving.current || !journey) return;
    const completeFields = { ...fields, ...(point ? { feeling: point } : {}) };
    if (
      required &&
      !requiredFields.every((f) => fieldComplete(completeFields, f))
    ) {
      setPanel("note");
      return;
    }
    saving.current = true;
    const id = `moment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const success = await act({
      type: "event",
      event: {
        id,
        entityId: params.reportId ?? (required ? "report:" + day : id),
        kind: "report",
        day,
        fields: completeFields,
        label: label.trim() || (point ? feeling.label : "Архивная запись"),
        note: note.trim(),
        required,
      },
    });
    saving.current = false;
    if (!success) return;
    savedRef.current = true;
    await act({ type: "draft:remove", id: draftKey });
    pulse(true);
    setSaved(true);
  }
  function adjust(axis: "valence" | "energy", delta: number) {
    choose({
      ...preview,
      [axis]: Math.max(0, Math.min(6, preview[axis] + delta)),
    });
    pulse();
  }
  return (
    <View style={{ flex: 1 }}>
      <FeelingBackdrop point={preview} />
      <View style={{ flex: 1, marginTop: safe.top, marginBottom: safe.bottom }}>
        {saved ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: 28,
              gap: 25,
            }}
          >
            <Enter>
              <View style={{ alignItems: "center", gap: 18 }}>
                <Companion size={200} mode="support" />
                <T
                  size={30}
                  weight="500"
                  style={{ color: ink, textAlign: "center", letterSpacing: -1 }}
                >
                  {params.reportId ? "Изменения сохранены" : "Запись сохранена"}
                </T>
                <T size={14} style={{ color: muted, textAlign: "center" }}>
                  {day < today
                    ? "Запись обновлена в истории. Стрик закрытого дня и награды не пересчитываются."
                    : "Запись уже в вашей истории. Зачёт дня учитывает все задания плана."}
                </T>
              </View>
            </Enter>
            <Button
              title="Вернуться на путь"
              onPress={() => router.dismissTo("/")}
            />
            <Button
              title="Открыть историю"
              secondary
              icon="history"
              onPress={() => router.dismissTo("/history")}
            />
          </View>
        ) : (
          <>
            <View
              style={{
                position: "absolute",
                top: available * 0.045,
                left: 18,
                right: 18,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Закрыть карту ощущений"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace("/")
                }
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: ink + "30",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" color={ink} />
              </Touch>
              <T size={17} weight="500" style={{ color: ink }}>
                Как вы сейчас?
              </T>
              <Touch
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel="Сохранить момент"
                accessibilityState={{
                  disabled: (!point && !legacy) || persisting,
                }}
                disabled={(!point && !legacy) || persisting}
                onPress={save}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: ink + "40",
                  backgroundColor: point ? feeling.hue + "14" : "transparent",
                  opacity: point ? 1 : 0.3,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="check" color={ink} size={27} />
              </Touch>
            </View>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: available * 0.2,
                height: available * 0.18,
                left: 0,
                right: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FeelingCharacter
                point={preview}
                size={Math.min(142, available * 0.19)}
              />
            </View>
            <T
              size={point ? 26 : 23}
              weight="500"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{
                position: "absolute",
                top: available * 0.378,
                left: 22,
                right: 22,
                color: ink,
                textAlign: "center",
                letterSpacing: -0.6,
              }}
            >
              {point ? label || feeling.label : "Как это ощущается?"}
            </T>
            <T
              size={12}
              numberOfLines={2}
              style={{
                position: "absolute",
                top: available * 0.43,
                left: 20,
                right: 20,
                color: muted,
                textAlign: "center",
              }}
            >
              {point
                ? feelingHint(point)
                : "Коснитесь поля или проведите по нему"}
            </T>
            <View
              style={{
                position: "absolute",
                top: available * 0.475,
                left: (dimensions.width - size) / 2,
              }}
            >
              <FeelingGrid size={size} point={point} onChange={choose} />
            </View>
            <View
              style={{
                position: "absolute",
                top: available * 0.475 + size + 5,
                left: 10,
                right: 10,
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Добавить название, сон и заметку"
                onPress={() => setPanel("note")}
                style={{ minHeight: 44, padding: 10, justifyContent: "center" }}
              >
                <T size={11} style={{ color: muted }}>
                  {required
                    ? "Поля самоотчёта и заметка"
                    : "Название и заметка"}
                </T>
              </Touch>
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Выбрать состояние кнопками"
                onPress={() => setPanel("controls")}
                style={{ minHeight: 44, padding: 10, justifyContent: "center" }}
              >
                <T size={11} style={{ color: muted }}>
                  Без жеста
                </T>
              </Touch>
            </View>
          </>
        )}
      </View>
      <Modal
        visible={panel !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPanel(null)}
      >
        <KeyboardAvoidingView
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "#091C1855",
          }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            accessibilityLabel="Закрыть дополнительные поля"
            onPress={() => setPanel(null)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <View
            style={{
              maxHeight: "85%",
              backgroundColor: theme.page,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 24,
              paddingTop: 24,
              paddingBottom: Math.max(safe.bottom, 16),
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 16, paddingBottom: 10 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <T size={24} weight="500">
                  {panel === "controls"
                    ? "Ваше ощущение"
                    : "Пара слов о моменте"}
                </T>
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel="Закрыть дополнительные поля"
                  onPress={() => setPanel(null)}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="close" color={theme.text} />
                </Touch>
              </View>
              {panel === "controls" ? (
                <>
                  <T muted size={13}>
                    Выберите две стороны ощущения. Правильного ответа здесь нет.
                  </T>
                  {(["valence", "energy"] as const).map((axis) => (
                    <View key={axis} style={{ gap: 8 }}>
                      <T size={15}>
                        {axis === "valence"
                          ? "Неприятно — приятно"
                          : "Мало — много энергии"}
                      </T>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 18,
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Touch
                          haptic={false}
                          accessibilityRole="button"
                          accessibilityLabel={
                            axis === "valence"
                              ? "Менее приятно"
                              : "Меньше энергии"
                          }
                          onPress={() => adjust(axis, -1)}
                          style={{
                            width: 60,
                            height: 52,
                            borderRadius: 20,
                            backgroundColor: theme.soft,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <T size={25}>−</T>
                        </Touch>
                        <T size={20}>{point ? point[axis] + 1 : "—"} / 7</T>
                        <Touch
                          haptic={false}
                          accessibilityRole="button"
                          accessibilityLabel={
                            axis === "valence" ? "Приятнее" : "Больше энергии"
                          }
                          onPress={() => adjust(axis, 1)}
                          style={{
                            width: 60,
                            height: 52,
                            borderRadius: 20,
                            backgroundColor: theme.soft,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <T size={25}>+</T>
                        </Touch>
                      </View>
                    </View>
                  ))}
                  <T size={18} weight="500">
                    {point ? feeling.label : "Ощущение пока не выбрано"}
                  </T>
                </>
              ) : (
                <>
                  <T size={13} muted>
                    Название — подсказка. Можно описать ощущение своими словами.
                  </T>
                  <TextInput
                    accessibilityLabel="Название ощущения"
                    value={label}
                    onChangeText={setLabel}
                    placeholder={point ? feeling.label : "Своими словами"}
                    placeholderTextColor={theme.muted}
                    maxLength={60}
                    style={{
                      fontFamily: "Onest",
                      fontSize: 18,
                      color: theme.text,
                      borderRadius: 18,
                      padding: 15,
                      backgroundColor: theme.soft,
                    }}
                  />
                  {journey && required && (
                    <>
                      <T muted size={12}>
                        Эти поля заданы в вашем плане. Для зачёта дня заполните
                        каждое из них.
                      </T>
                      <ReportFieldsEditor
                        fields={fields}
                        required={requiredFields}
                        onChange={setFields}
                      />
                    </>
                  )}
                  <TextInput
                    accessibilityLabel="Заметка о моменте"
                    multiline
                    value={note}
                    onChangeText={setNote}
                    placeholder="Что хочется запомнить?"
                    placeholderTextColor={theme.muted}
                    maxLength={500}
                    textAlignVertical="top"
                    style={{
                      minHeight: 110,
                      fontFamily: "Onest",
                      fontSize: 16,
                      color: theme.text,
                      borderRadius: 18,
                      padding: 15,
                      backgroundColor: theme.soft,
                    }}
                  />
                  <T size={11} muted>
                    {note.length}/500 · заполнение необязательно
                  </T>
                </>
              )}
              <Button
                title="Вернуться к карте"
                onPress={() => setPanel(null)}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
