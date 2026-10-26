import { useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T, Button, RoundButton, Panel } from "../components/UI";
import { Touch, Enter } from "../components/Motion";
import { FeelingBackdrop } from "../components/FeelingBackdrop";
import { FeelingCharacter } from "../components/FeelingCharacter";
import { FeelingGrid } from "../components/FeelingGrid";
import { ReportFieldsEditor } from "../components/ReportFieldsEditor";
import { Companion } from "../components/Companion";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { useFeedback } from "../hooks/useFeedback";
import { latestReports } from "../core/questionnaires";
import { planForDay } from "../core/therapy";
import {
  reportSteps,
  reportStepError,
  reportDraftKey,
  reportFieldLabels,
} from "../core/reportFlow";
import { feelingAt, feelingHint, type FeelingPoint } from "../core/feelings";
import type { ReportFields, PatientDraft } from "../core/journeyModel";
import { usePatientConnection } from "../state/PatientConnectionProvider";
import {
  ReportQueuedError,
  type PatientReport,
} from "../core/patientReportSync";
const serverReportFields = [
  "feeling",
  "sleep",
  "anxiety",
  "functioning",
  "tolerability",
] as const;
export default function CheckInScreen() {
  const { theme, today, state } = useApp(),
    { journey, act } = useJourney();
  const connection = usePatientConnection();
  const serverMode = connection.mode === "server";
  const params = useLocalSearchParams<{
    day?: string;
    reportId?: string;
    personal?: string;
  }>();
  const [day] = useState(() => params.day ?? today);
  const plan = journey ? planForDay(journey, day) : undefined,
    requiredFields = serverMode
      ? [...serverReportFields]
      : (plan?.reportFields ?? []);
  const existing = journey
    ? latestReports(journey, day).find((r) =>
        params.reportId
          ? (r.entityId ?? r.id) === params.reportId
          : params.personal !== "1" && r.required,
      )
    : undefined;
  const legacy = params.reportId?.startsWith("legacy:")
    ? journey?.legacyArchive.find((r) => r.id === params.reportId!.slice(7))
    : undefined;
  const required =
    existing?.required ??
    (!legacy &&
      day >= (journey?.plan.startedAt ?? day) &&
      params.personal !== "1");
  const draftKey = reportDraftKey(day, required, params.reportId),
    draft = journey?.drafts[draftKey];
  const [fields, setFields] = useState<ReportFields>(
    () =>
      draft?.fields ??
      existing?.fields ??
      (legacy
        ? {
            sleep: legacy.sleep,
            ...(legacy.feeling ? { feeling: legacy.feeling } : {}),
          }
        : {}),
  );
  const [note, setNote] = useState(
    draft?.note ?? existing?.note ?? legacy?.note ?? "",
  );
  const [label, setLabel] = useState(
    draft?.label ?? existing?.label ?? legacy?.label ?? "",
  );
  const steps = reportSteps(
    required,
    requiredFields,
    !!legacy && !fields.feeling,
  );
  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(draft?.step ?? 0, steps.length - 1)),
  );
  const [controls, setControls] = useState(false),
    [saved, setSaved] = useState(false),
    [queued, setQueued] = useState(false),
    [localIssue, setLocalIssue] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const savedRef = useRef(false),
    inFlight = useRef(false),
    pending = useRef<PatientDraft | null>(null);
  const reportCommand = useRef<PatientReport | null>(null);
  const safe = useSafeAreaInsets(),
    { width, height } = useWindowDimensions(),
    { pulse } = useFeedback();
  const point = fields.feeling ?? null,
    preview = point ?? { valence: 3, energy: 3 },
    feeling = feelingAt(preview),
    current = steps[step] ?? steps[0];
  const hasContent = !!(
    Object.keys(fields).length ||
    note ||
    label ||
    step > 0
  );
  pending.current = {
    id: draftKey,
    kind: "report",
    day,
    fields,
    note,
    label,
    step,
    formVersion: plan?.id,
  };
  useEffect(() => {
    if (saved || !hasContent) return;
    const timer = setTimeout(() => {
      if (!savedRef.current && pending.current)
        void act({ type: "draft", draft: pending.current });
    }, 350);
    return () => clearTimeout(timer);
  }, [fields, note, label, step, saved, hasContent, act]);
  useEffect(
    () => () => {
      if (
        !savedRef.current &&
        pending.current &&
        (Object.keys(pending.current.fields ?? {}).length ||
          pending.current.note ||
          pending.current.step)
      )
        void act({ type: "draft", draft: pending.current });
    },
    [act],
  );
  const update = (value: ReportFields) => {
    setError("");
    setFields(value);
  };
  const choose = (value: FeelingPoint) => update({ ...fields, feeling: value });
  const adjust = (axis: "valence" | "energy", delta: number) => {
    choose({
      ...preview,
      [axis]: Math.max(0, Math.min(6, preview[axis] + delta)),
    });
    pulse();
  };
  async function advance() {
    setError("");
    const message = reportStepError(
      current,
      fields,
      required ? requiredFields : [],
    );
    if (message) {
      setError(message);
      return;
    }
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    if (inFlight.current || !journey) return;
    for (let i = 0; i < steps.length; i++) {
      const invalid = reportStepError(
        steps[i],
        fields,
        required ? requiredFields : [],
      );
      if (invalid) {
        setStep(i);
        setError(invalid);
        return;
      }
    }
    inFlight.current = true;
    setBusy(true);
    if (
      pending.current &&
      !(await act({ type: "draft", draft: pending.current }))
    ) {
      inFlight.current = false;
      setBusy(false);
      setError("Не удалось сохранить черновик. Ответы остались здесь.");
      return;
    }
    const id =
      "report-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    if (serverMode && required) {
      if (
        !point ||
        fields.sleep === undefined ||
        fields.anxiety === undefined ||
        fields.functioning === undefined ||
        fields.tolerability === undefined
      ) {
        inFlight.current = false;
        setBusy(false);
        setError("Заполните все разделы самоотчёта.");
        return;
      }
      const value = reportCommand.current ?? {
        id,
        entityId: params.reportId ?? "report:" + day,
        day,
        formVersion: "syncli-report-v1" as const,
        reportedAt: new Date().toISOString(),
        fields: {
          feeling: point,
          sleep: fields.sleep,
          anxiety: fields.anxiety,
          functioning: fields.functioning,
          tolerability: fields.tolerability,
        },
        note: note.trim(),
        label: label.trim() || feeling.label,
      };
      reportCommand.current = value;
      try {
        await connection.sendReport(value);
      } catch (e) {
        if (!(e instanceof ReportQueuedError)) {
          inFlight.current = false;
          setBusy(false);
          setError(
            e instanceof Error
              ? e.message
              : "Не удалось сохранить самоотчёт для отправки.",
          );
          return;
        }
        setQueued(true);
      }
    }
    savedRef.current = true;
    const success = await act({
      type: "event",
      draftId: draftKey,
      event: {
        id: reportCommand.current?.id ?? id,
        entityId: params.reportId ?? (required ? "report:" + day : id),
        kind: "report",
        day,
        fields,
        label: label.trim() || (point ? feeling.label : "Архивная запись"),
        note: note.trim(),
        required,
      },
    });
    inFlight.current = false;
    setBusy(false);
    if (success) {
      pulse(true);
      setSaved(true);
    } else if (serverMode && required && reportCommand.current) {
      // Acknowledged or durably queued already: do not resend edited values with
      // the same command ID if saving the separate local history failed.
      setLocalIssue(true);
      setSaved(true);
    } else {
      savedRef.current = false;
      setError(
        "Не удалось сохранить запись. Черновик сохранён; можно повторить.",
      );
    }
  }
  if (!journey)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.page,
          padding: 24,
          paddingTop: safe.top + 40,
        }}
      >
        <T>Загружаем вашу запись…</T>
      </View>
    );
  const title = required ? "Самоотчёт" : "Личный момент";
  const size = Math.min(
    width - 40,
    Math.max(252, Math.min(340, height * 0.44)),
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FeelingBackdrop point={preview} />
      <View
        style={{
          paddingTop: safe.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <RoundButton
          icon={step > 0 && !saved ? "back" : "close"}
          label={
            step > 0 && !saved ? "Предыдущий шаг" : "Закрыть карту ощущений"
          }
          onPress={() => {
            if (step > 0 && !saved) setStep(step - 1);
            else if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        />
        <View style={{ flex: 1 }}>
          <T size={17} weight="600">
            {title}
          </T>
          <T size={11} muted>
            {saved
              ? "Сохранено"
              : String(step + 1) +
                " из " +
                steps.length +
                " · " +
                (current === "feeling"
                  ? "Ощущения"
                  : current === "details"
                    ? "Разделы плана"
                    : "Заметка и итог")}
          </T>
        </View>
      </View>
      {saved ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            gap: 18,
            paddingBottom: safe.bottom + 24,
          }}
        >
          <Enter>
            <View style={{ alignItems: "center", gap: 14 }}>
              {state.gameplay ? (
                <Companion size={176} mode="support" />
              ) : (
                <Icon name="check" size={64} color={theme.accent} />
              )}
              <T size={26} weight="600" style={{ textAlign: "center" }}>
                {localIssue
                  ? "Самоотчёт принят к отправке"
                  : queued
                    ? "Самоотчёт сохранён на телефоне"
                    : params.reportId
                      ? "Изменения сохранены"
                      : required
                        ? "Самоотчёт сохранён"
                        : "Момент сохранён"}
              </T>
              <T size={13} muted style={{ textAlign: "center" }}>
                {localIssue
                  ? "Копия не попала в историю телефона. Отправка подтверждена или ожидает подтверждения сервера."
                  : queued
                    ? "Отправка врачу ожидает подтверждения сервера."
                    : serverMode && required
                      ? "Самоотчёт отправлен врачу."
                      : !state.gameplay
                        ? "Запись доступна в вашей истории."
                        : day < today
                          ? "Запись обновлена. Закрытый итог дня и прошлую серию исправления не меняют."
                          : required
                            ? "Отчёт учтён в сегодняшнем плане. Проверьте, остались ли другие задания."
                            : "Личный момент дополняет историю. Обязательный самоотчёт учитывается отдельно."}
              </T>
            </View>
          </Enter>
          <Button
            title="Вернуться к плану"
            onPress={() => router.dismissTo("/plan")}
          />
          <Button
            title="Открыть историю"
            secondary
            onPress={() => router.dismissTo("/history")}
          />
        </View>
      ) : (
        <>
          <ScrollView
            key={current}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 24,
              gap: 18,
            }}
            showsVerticalScrollIndicator
          >
            {draft?.formVersion && draft.formVersion !== plan?.id && (
              <T size={12}>
                План обновился. Проверьте разделы перед сохранением; ваши ответы
                сохранены.
              </T>
            )}
            {day < today && (
              <T size={12} muted>
                Запись за {day}. Сохранение изменит историю; игровой итог
                закрытого дня останется прежним.
              </T>
            )}
            {current === "feeling" && (
              <>
                <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
                  <FeelingCharacter
                    point={preview}
                    size={Math.min(140, height * 0.19)}
                  />
                  <T size={24} weight="600" style={{ textAlign: "center" }}>
                    {point ? feeling.label : "Как вы себя чувствуете?"}
                  </T>
                  <T size={13} muted style={{ textAlign: "center" }}>
                    {point
                      ? feelingHint(preview)
                      : "Коснитесь карты, чтобы выбрать состояние. Любые ощущения одинаково важны."}
                  </T>
                </View>
                <View style={{ alignItems: "center" }}>
                  <FeelingGrid size={size} point={point} onChange={choose} />
                </View>
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel="Управление картой ощущений кнопками"
                  onPress={() => setControls(!controls)}
                  style={{
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <T size={12} weight="600">
                    {controls ? "Скрыть кнопки" : "Выбрать состояние кнопками"}
                  </T>
                </Touch>
                {controls && (
                  <View style={{ gap: 12 }}>
                    {(["valence", "energy"] as const).map((axis) => (
                      <View
                        key={axis}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <RoundButton
                          icon="back"
                          label={
                            axis === "valence" ? "Грустнее" : "Меньше энергии"
                          }
                          onPress={() => adjust(axis, -1)}
                        />
                        <T size={13}>
                          {axis === "valence" ? "Настроение" : "Энергия"}:{" "}
                          {preview[axis]} из 6
                        </T>
                        <RoundButton
                          icon="arrow"
                          label={
                            axis === "valence"
                              ? "Больше радости"
                              : "Больше энергии"
                          }
                          onPress={() => adjust(axis, 1)}
                        />
                      </View>
                    ))}
                  </View>
                )}
                {required && (
                  <T size={12} muted>
                    Дальше:{" "}
                    {requiredFields
                      .filter((f) => f !== "feeling")
                      .map((f) => reportFieldLabels[f].toLowerCase())
                      .join(", ") || "необязательная заметка"}
                    . Состояние — один из разделов полного самоотчёта.
                  </T>
                )}
              </>
            )}
            {current === "details" && (
              <>
                <T size={24} weight="600">
                  Ещё несколько наблюдений
                </T>
                <T size={13} muted>
                  Разделы вашего плана. Ответы помогают сохранить полную картину
                  дня.
                </T>
                <ReportFieldsEditor
                  fields={fields}
                  required={requiredFields}
                  onChange={update}
                />
              </>
            )}
            {current === "note" && (
              <>
                <T size={24} weight="600">
                  Пара слов о дне
                </T>
                <T size={13} muted>
                  Название и заметка необязательны. Можно сразу сохранить.
                </T>
                <TextInput
                  accessibilityLabel="Название момента"
                  value={label}
                  onChangeText={setLabel}
                  placeholder={point ? feeling.label : "Название записи"}
                  placeholderTextColor={theme.muted}
                  maxLength={80}
                  style={{
                    backgroundColor: theme.surface,
                    color: theme.text,
                    fontFamily: "Onest",
                    fontSize: 16,
                    padding: 16,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                />
                <TextInput
                  accessibilityLabel="Заметка"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={2000}
                  placeholder="Что хочется запомнить?"
                  placeholderTextColor={theme.muted}
                  style={{
                    backgroundColor: theme.surface,
                    color: theme.text,
                    fontFamily: "Onest",
                    fontSize: 16,
                    padding: 16,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    minHeight: 120,
                    textAlignVertical: "top",
                  }}
                />
                <Panel style={{ gap: 10 }}>
                  <T size={14} weight="600">
                    {required
                      ? "Что сохранится в самоотчёте"
                      : "Ваш личный момент"}
                  </T>
                  {(required
                    ? requiredFields
                    : point
                      ? ["feeling" as const]
                      : []
                  ).map((f) => (
                    <T key={f} size={12}>
                      {reportFieldLabels[f]}:{" "}
                      {f === "feeling"
                        ? point
                          ? feeling.label
                          : "Не выбрано"
                        : String(fields[f] ?? "Не заполнено")}
                    </T>
                  ))}
                  {!required && (
                    <T size={11} muted>
                      Личные моменты не заменяют обязательные задания дня.
                    </T>
                  )}
                </Panel>
              </>
            )}
          </ScrollView>
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: Math.max(16, safe.bottom),
              gap: 8,
              backgroundColor: theme.page,
            }}
          >
            {error && (
              <T
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                size={12}
                style={{ color: theme.text }}
              >
                {error}
              </T>
            )}
            <Button
              title={
                busy
                  ? "Сохраняю…"
                  : step < steps.length - 1
                    ? "Далее"
                    : required
                      ? "Сохранить самоотчёт"
                      : "Сохранить момент"
              }
              disabled={busy}
              onPress={() => void advance()}
            />
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}
