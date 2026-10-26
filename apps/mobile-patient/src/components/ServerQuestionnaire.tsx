import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { router, type Href } from "expo-router";
import { Screen, T, Button, Heading } from "./UI";
import { Touch } from "./Motion";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { usePatientConnection } from "../state/PatientConnectionProvider";
import { questionnaires } from "../config/questionnaires";
import { QuestionnaireQueuedError } from "../core/patientQuestionnaireSync";
import type { PatientDraft } from "../core/journeyModel";

export function ServerQuestionnaire({ id }: { id?: string }) {
  const { theme, today } = useApp(),
    { journey, act } = useJourney(),
    connection = usePatientConnection();
  const items = connection.snapshot?.questionnaires;
  const assignment =
    items?.kind === "ready" ? items.items.find((a) => a.id === id) : undefined;
  const form = assignment ? questionnaires[assignment.formId] : undefined;
  const draftKey = "server-questionnaire:" + id,
    draft = journey?.drafts[draftKey];
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => draft?.answers ?? Array(form?.questions.length ?? 0).fill(null),
  );
  const [impact, setImpact] = useState<number | undefined>(draft?.impact),
    [step, setStep] = useState(draft?.step ?? 0),
    [done, setDone] = useState(false),
    [queued, setQueued] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const currentDraft = useRef<PatientDraft | null>(null),
    final = useRef(false),
    supportShown = useRef(false),
    submitting = useRef(false);
  const pending = connection.pendingQuestionnaires.some(
    (item) =>
      (item.mutation.value as { assignmentId?: string } | undefined)
        ?.assignmentId === id,
  );
  currentDraft.current =
    assignment && form && assignment.status === "issued" && !done && !pending
      ? {
          id: draftKey,
          day: today,
          kind: "questionnaire",
          answers,
          impact,
          step,
          formVersion: form.version,
        }
      : null;
  useEffect(() => {
    if (!currentDraft.current) return;
    const timer = setTimeout(() => {
      if (currentDraft.current && !final.current)
        void act({ type: "draft", draft: currentDraft.current });
    }, 300);
    return () => clearTimeout(timer);
  }, [answers, impact, step, act]);
  useEffect(
    () => () => {
      if (!final.current && currentDraft.current)
        void act({ type: "draft", draft: currentDraft.current });
    },
    [act],
  );
  if (!assignment || !form || !journey)
    return (
      <Screen title="Опрос" back>
        <Heading
          title="Задание недоступно"
          body="Обновите план и проверьте подключение."
        />
        <Button
          title="Вернуться к плану"
          onPress={() => router.replace("/plan")}
        />
      </Screen>
    );
  if (done || pending || assignment.status === "submitted")
    return (
      <Screen title="Опрос" back>
        <View style={{ paddingTop: 80, gap: 24 }}>
          <T size={42}>✓</T>
          <Heading
            title={
              queued || pending
                ? "Ответы сохранены на телефоне"
                : "Опрос завершён"
            }
            body={
              queued || pending
                ? "Отправка врачу ожидает подтверждения сервера."
                : "Ответы отправлены врачу."
            }
          />
          <Button
            title="Вернуться к плану"
            onPress={() => router.dismissTo("/plan")}
          />
        </View>
      </Screen>
    );
  const isImpact = step === form.questions.length,
    needsImpact =
      !!form.impactQuestion && answers.some((v) => v !== null && v > 0),
    selected = isImpact ? impact : answers[step],
    options = isImpact ? form.impactOptions! : form.options;
  async function next() {
    if (
      selected === null ||
      selected === undefined ||
      submitting.current ||
      !assignment ||
      !form
    )
      return;
    if (step < form.questions.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!isImpact && needsImpact) {
      setStep(form.questions.length);
      return;
    }
    if (answers.some((value) => value === null)) {
      setError("Ответьте на все вопросы.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    if (
      currentDraft.current &&
      !(await act({ type: "draft", draft: currentDraft.current }))
    ) {
      submitting.current = false;
      setBusy(false);
      setError("Не удалось сохранить ответы на телефоне.");
      return;
    }
    let isQueued = false;
    try {
      await connection.sendQuestionnaire({
        id: "test-" + Date.now() + "-" + Math.random().toString(36).slice(2),
        assignmentId: assignment.id,
        protocolVersion: form.version,
        measuredAt: new Date().toISOString(),
        answers: answers as number[],
        impact: isImpact ? (impact ?? null) : null,
      });
    } catch (e) {
      if (e instanceof QuestionnaireQueuedError) isQueued = true;
      else {
        submitting.current = false;
        setBusy(false);
        setError(
          e instanceof Error ? e.message : "Не удалось сохранить ответы.",
        );
        return;
      }
    }
    final.current = true;
    if (!isQueued) await act({ type: "draft:remove", id: draftKey });
    setQueued(isQueued);
    setDone(true);
    setBusy(false);
    submitting.current = false;
  }
  return (
    <Screen title="Назначенный опрос" back>
      <View style={{ gap: 18, paddingTop: 12 }}>
        <T size={21} weight="600">
          {form.title}
        </T>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T size={12} muted>
            {isImpact
              ? "Дополнительный вопрос"
              : `Вопрос ${step + 1} из ${form.questions.length}`}
          </T>
          <T size={12} muted>
            {form.id.toUpperCase()}
          </T>
        </View>
        <View
          style={{ height: 5, backgroundColor: theme.border, borderRadius: 3 }}
        >
          <View
            style={{
              height: 5,
              width: `${((step + 1) / (form.questions.length + (needsImpact ? 1 : 0))) * 100}%`,
              backgroundColor: theme.accent,
              borderRadius: 3,
            }}
          />
        </View>
        <T muted size={13}>
          {isImpact ? "О влиянии на повседневную жизнь" : form.instruction}
        </T>
        <T size={25} weight="500" style={{ letterSpacing: -0.6 }}>
          {isImpact ? form.impactQuestion : form.questions[step]}
        </T>
        <View style={{ gap: 10 }}>
          {options.map((label, index) => (
            <Touch
              key={label}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected: selected === index }}
              onPress={() => {
                if (isImpact) setImpact(index);
                else {
                  setAnswers((values) =>
                    values.map((old, i) => (i === step ? index : old)),
                  );
                  if (
                    form.id === "phq9" &&
                    step === 8 &&
                    index > 0 &&
                    !supportShown.current
                  ) {
                    supportShown.current = true;
                    Alert.alert(
                      "Поддержка доступна сейчас",
                      "Если есть опасность прямо сейчас, не ждите ответа в приложении. Здесь нет работающей экстренной связи с врачом.",
                      [
                        {
                          text: "Открыть помощь",
                          onPress: () => router.push("/help" as Href),
                        },
                        { text: "Продолжить опрос" },
                      ],
                    );
                  }
                }
              }}
              style={{
                padding: 19,
                minHeight: 62,
                borderRadius: 21,
                borderWidth: 1,
                borderColor: selected === index ? theme.accent : theme.border,
                backgroundColor:
                  selected === index ? theme.tint : theme.surface,
                flexDirection: "row",
                gap: 14,
                alignItems: "center",
              }}
            >
              <T size={23}>{selected === index ? "◉" : "○"}</T>
              <T size={15} style={{ flex: 1 }}>
                {label}
              </T>
            </Touch>
          ))}
        </View>
        {!!error && (
          <T accessibilityRole="alert" size={12}>
            {error}
          </T>
        )}
        <Button
          title={
            step >= form.questions.length - 1 && (isImpact || !needsImpact)
              ? "Завершить опрос"
              : "Далее"
          }
          disabled={selected === null || selected === undefined || busy}
          onPress={() => void next()}
        />
        {step > 0 && (
          <Button
            title="Предыдущий вопрос"
            secondary
            onPress={() => setStep(step - 1)}
          />
        )}
        <Touch
          accessibilityRole="button"
          onPress={() => router.push("/help" as Href)}
          style={{ padding: 12 }}
        >
          <T muted size={12}>
            Нужна помощь сейчас
          </T>
        </Touch>
        <T muted size={10}>
          {form.attribution}
        </T>
      </View>
    </Screen>
  );
}
