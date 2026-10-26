import { useEffect, useRef, useState } from "react";
import { View, Alert } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Screen, T, Button, Heading } from "../components/UI";
import { Touch } from "../components/Motion";
import { useJourney } from "../state/JourneyProvider";
import { useApp } from "../state/AppProvider";
import { questionnaires } from "../config/questionnaires";
import { completeQuestionnaire } from "../core/questionnaires";
import type { PatientDraft } from "../core/journeyModel";
import { usePatientConnection } from "../state/PatientConnectionProvider";
import { ServerQuestionnaire } from "../components/ServerQuestionnaire";

export default function QuestionnaireScreen() {
  const { mode } = usePatientConnection();
  const { id } = useLocalSearchParams<{ id: string }>();
  return mode === "server" ? (
    <ServerQuestionnaire id={id} />
  ) : (
    <DemoQuestionnaire />
  );
}

function DemoQuestionnaire() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { journey, act, saving } = useJourney();
  const { theme, today, state } = useApp();
  const assignment = journey?.plan.tests.find((t) => t.id === id),
    form = assignment ? questionnaires[assignment.formId] : undefined;
  const draftKey = "questionnaire:" + id,
    draft = journey?.drafts[draftKey];
  const [answers, setAnswers] = useState<(number | null)[]>(
    draft?.answers ?? Array(form?.questions.length ?? 0).fill(null),
  );
  const [impact, setImpact] = useState<number | undefined>(draft?.impact),
    [step, setStep] = useState(
      Math.max(
        0,
        Math.min(draft?.step ?? 0, (form?.questions.length ?? 1) - 1),
      ),
    ),
    [done, setDone] = useState(false);
  const final = useRef(false),
    pending = useRef<PatientDraft | undefined>(draft);
  const supportShown = useRef(false);
  const already =
    journey?.events.some(
      (e) => e.kind === "questionnaire" && e.assignmentId === id,
    ) ?? false;
  pending.current =
    assignment && assignment.day === today && !already && !done
      ? {
          id: draftKey,
          kind: "questionnaire",
          day: assignment.day,
          answers,
          impact,
          step,
          formVersion: form?.version,
        }
      : undefined;
  useEffect(() => {
    if (!pending.current || done) return;
    const timer = setTimeout(() => {
      if (pending.current) void act({ type: "draft", draft: pending.current });
    }, 300);
    return () => clearTimeout(timer);
  }, [answers, impact, step, done, act]);
  useEffect(
    () => () => {
      if (!final.current && pending.current)
        void act({ type: "draft", draft: pending.current });
    },
    [act],
  );
  if (!assignment || !form || !journey)
    return (
      <Screen title="Опрос" back>
        <Heading title="Задание не найдено" />
        <Button
          title="Вернуться к плану"
          onPress={() => router.replace("/plan")}
        />
      </Screen>
    );
  if (done || already)
    return (
      <Screen title="Опрос" back>
        <View style={{ paddingTop: 80, gap: 24 }}>
          <T size={42}>✓</T>
          <Heading
            title="Опрос завершён"
            body="Прохождение сохранено в вашем плане."
          />
          <Button
            title="Вернуться к пути"
            onPress={() => router.dismissTo("/")}
          />
        </View>
      </Screen>
    );
  if (assignment.day !== today)
    return (
      <Screen title="Опрос" back>
        <Heading
          title={
            assignment.day < today
              ? "Срок задания прошёл"
              : "Опрос назначен на другую дату"
          }
          body={
            assignment.day > today
              ? "Опрос откроется " +
                new Date(assignment.day + "T12:00:00").toLocaleDateString(
                  "ru-RU",
                ) +
                ". Его назначает врач."
              : "Назначенная дата: " +
                new Date(assignment.day + "T12:00:00").toLocaleDateString(
                  "ru-RU",
                ) +
                ". Задание доступно только в назначенный день." +
                (state.gameplay ? " Закрытый игровой итог не меняется." : "")
          }
        />
        <Button
          title="Вернуться к сегодняшнему плану"
          onPress={() => router.dismissTo("/plan")}
        />
      </Screen>
    );
  const isImpact = step === form.questions.length,
    needsImpact =
      !!form.impactQuestion && answers.some((v) => v !== null && v > 0);
  const selected = isImpact ? impact : answers[step],
    options = isImpact ? form.impactOptions! : form.options;
  async function next() {
    if (selected === null || selected === undefined || !assignment || !form)
      return;
    if (step < form.questions.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!isImpact && needsImpact) {
      setStep(form.questions.length);
      return;
    }
    const completion = completeQuestionnaire(assignment, answers, impact);
    const success = await act({
      type: "event",
      event: {
        id: "test-" + Date.now(),
        kind: "questionnaire",
        day: assignment.day,
        ...completion,
      },
    });
    if (success) {
      final.current = true;
      setDone(true);
    }
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
                  setAnswers((v) =>
                    v.map((old, i) => (i === step ? index : old)),
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
        <Button
          title={
            step >= form.questions.length - 1 && (isImpact || !needsImpact)
              ? "Завершить опрос"
              : "Далее"
          }
          disabled={selected === null || selected === undefined || saving}
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
