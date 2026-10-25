import { useCallback, useEffect, useRef, useState } from "react";
import type { EncounterField, PatientRecord, Visit } from "./model";
import { completionErrors } from "./commands";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import type { Navigate } from "./PatientDirectory";
import {
  encounterLabels,
  formatDate,
  localDateTime,
  visitStatus,
} from "./labels";
import { PatientContext } from "./PatientContext";
import { PatientBrief } from "./PatientBrief";
import { CarePlan, Referrals } from "./CarePlan";
import { MeasurementForm } from "./Dynamics";
import { AppointmentForm, ConsentForm } from "./PatientForms";
import { ApiError } from "./repository";
import { SourceLinks, SourcePicker } from "./SourceLibrary";
import {
  Badge,
  Button,
  ErrorNotice,
  Field,
  Modal,
  Section,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";
export type RegisterGuard = (guard: (() => Promise<boolean>) | null) => void;
const steps = ["Контекст", "Оценка состояния", "Лечение и план", "Итог приёма"];
const contextFields: EncounterField[] = [
  "complaints",
  "history",
  "onset",
  "functioning",
  "sleep",
  "medicationReview",
  "adverseEffects",
  "adherence",
];
const assessmentFields: EncounterField[] = [
  "mentalState",
  "physicalState",
  "mania",
  "psychosis",
  "substances",
  "somaticCauses",
  "differential",
];
const safetyFields: EncounterField[] = [
  "suicidalThoughts",
  "intentAndPlan",
  "pastAttempts",
  "meansAccess",
  "protectiveFactors",
  "safetyConclusion",
  "safetyAction",
];
const summaryFields: EncounterField[] = [
  "complaints",
  "mentalState",
  "safetyConclusion",
  "diagnosis",
  "conclusion",
  "recommendations",
  "patientPreference",
];

export function EncounterEditor({
  patient,
  visit,
  actions,
  navigate,
  registerGuard,
}: {
  patient: PatientRecord;
  visit: Visit;
  actions: WorkspaceActions;
  navigate: Navigate;
  registerGuard: RegisterGuard;
}) {
  const [draft, setDraft] = useState<Visit>(structuredClone(visit));
  const [step, setStep] = useState(visit.status === "completed" ? 3 : 0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [measurement, setMeasurement] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [addendum, setAddendum] = useState(false);
  const [reason, setReason] = useState("");
  const [addition, setAddition] = useState("");
  const [followup, setFollowup] = useState(false);
  const [conflict, setConflict] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const saved = useRef(JSON.stringify(visit));
  const version = useRef(patient.revision);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const savingRef = useRef<Promise<boolean> | null>(null);
  const readOnly = visit.status === "completed" || visit.status === "cancelled";
  const dirty = !readOnly && JSON.stringify(draft) !== saved.current;
  useEffect(() => {
    const next = JSON.stringify(visit);
    if (next === saved.current) {
      version.current = patient.revision;
      return;
    }
    if (JSON.stringify(draftRef.current) === saved.current) {
      saved.current = next;
      version.current = patient.revision;
      setDraft(structuredClone(visit));
    } else if (!savingRef.current) {
      setConflict(true);
    }
  }, [visit, patient.revision]);
  useEffect(() => {
    if (previousStep.current !== step) stepHeading.current?.focus();
    previousStep.current = step;
  }, [step]);
  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return savingRef.current;
    if (conflict) return false;
    const current = draftRef.current;
    if (readOnly || JSON.stringify(current) === saved.current) return true;
    setSaving(true);
    setError("");
    const operation = (async () => {
      try {
        const result = await actions.mutate(
          patient.id,
          { type: "visit.save", value: current },
          version.current,
        );
        const stored = result.visits.find((v) => v.id === current.id)!;
        saved.current = JSON.stringify(stored);
        version.current = result.revision;
        if (JSON.stringify(draftRef.current) === JSON.stringify(current))
          setDraft(stored);
        return true;
      } catch (e) {
        setError(message(e));
        if (e instanceof ApiError && e.status === 409) await actions.refresh();
        return false;
      } finally {
        setSaving(false);
        savingRef.current = null;
      }
    })();
    savingRef.current = operation;
    return operation;
  }, [actions.mutate, actions.refresh, patient.id, readOnly, conflict]);
  useEffect(() => {
    if (!dirty || readOnly || conflict || saving || error) return;
    const timer = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, readOnly, save, conflict, saving, error]);
  useEffect(() => {
    registerGuard(async () => {
      const first = await save();
      if (!first) return false;
      return save();
    });
    return () => registerGuard(null);
  }, [registerGuard, save]);
  useEffect(() => {
    function unload(e: BeforeUnloadEvent) {
      if (
        JSON.stringify(draftRef.current) !== saved.current &&
        (!readOnly || conflict)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", key);
    };
  }, [readOnly, save, conflict]);
  const setNote = (key: EncounterField, value: string) =>
    setDraft((d) => ({ ...d, notes: { ...d.notes, [key]: value } }));
  async function begin() {
    const value = { ...draftRef.current, status: "in-progress" as const };
    draftRef.current = value;
    setDraft(value);
    await save();
  }
  async function review() {
    if (await save()) {
      setError("");
      setStep(3);
      setConfirm(true);
    }
  }
  async function complete() {
    if (!(await save())) return;
    try {
      await actions.mutate(patient.id, {
        type: "visit.complete",
        id: visit.id,
      });
      setConfirm(false);
      setStep(3);
    } catch (e) {
      setError(message(e));
      setConfirm(false);
    }
  }
  async function changeStatus() {
    try {
      if (cancel) {
        if (!(await save())) return;
        await actions.mutate(patient.id, {
          type: "visit.cancel",
          id: visit.id,
          reason,
        });
        setCancel(false);
      } else {
        await actions.mutate(patient.id, {
          type: "visit.addendum",
          id: visit.id,
          text: addition,
          reason,
        });
        setAddendum(false);
      }
    } catch (e) {
      setError(message(e));
    }
  }
  const fields = (keys: EncounterField[]) =>
    keys.map((key) => (
      <Textarea
        key={key}
        label={encounterLabels[key]}
        value={draft.notes[key]}
        onChange={(e) => setNote(key, e.target.value)}
        rows={
          key === "mentalState" ||
          (key === "history" && visit.kind === "initial")
            ? 4
            : 3
        }
        required={key === "complaints" || key === "safetyConclusion"}
      />
    ));
  const errors = completionErrors(patient, draft);
  return (
    <>
      <Button
        variant="ghost"
        icon="back"
        onClick={() => navigate(`/patients/${patient.id}/visits`)}
      >
        К истории пациента
      </Button>
      <div className={styles.pageHeading} style={{ marginTop: 16 }}>
        <div>
          <div className={styles.eyebrow}>
            {patient.profile.name} · {patient.code}
          </div>
          <h1>
            {visit.status === "completed"
              ? "Итог приёма"
              : visit.kind === "initial"
                ? "Первичный приём"
                : "Повторный приём"}
          </h1>
          <p>
            {formatDate(visit.scheduledAt, {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {visit.durationMinutes} мин ·{" "}
            {visit.format === "in-person" ? "Очно" : "Дистанционно"}
          </p>
        </div>
        <div className={styles.row}>
          {visit.status === "scheduled" && (
            <Button onClick={() => void begin()} disabled={saving}>
              Начать приём
            </Button>
          )}
          <Badge tone={visit.status === "completed" ? "green" : "neutral"}>
            {visitStatus[visit.status]}
          </Badge>
          {!readOnly && (
            <span className={styles.saved} role="status">
              {saving
                ? "Сохраняется…"
                : dirty
                  ? "Есть изменения"
                  : "Черновик сохранён"}
            </span>
          )}
          {readOnly ? (
            <Button
              variant="secondary"
              icon="print"
              disabled={actions.busy || visit.status !== "completed"}
              onClick={async () => {
                try {
                  await actions.mutate(patient.id, {
                    type: "visit.print",
                    id: visit.id,
                    reason: "Рабочая копия для лечащего врача",
                  });
                  window.print();
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              Печать
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon="check"
              disabled={saving}
              onClick={() => void save()}
            >
              Сохранить
            </Button>
          )}
        </div>
      </div>
      {error && (
        <ErrorNotice>
          {error}
          <div className={styles.row} style={{ marginTop: 10 }}>
            <Button variant="secondary" onClick={() => void save()}>
              Повторить сохранение
            </Button>
          </div>
        </ErrorNotice>
      )}
      {conflict && (
        <Section title="Карта изменена в другой сессии">
          <p className={styles.reviewText}>
            Ваш текст сохранён в открытом редакторе. Сравните его с последней
            записью и выберите, какой вариант продолжить. Автосохранение
            приостановлено.
          </p>
          <details className={styles.details}>
            <summary>Сравнить записи</summary>
            {(Object.keys(draft.notes) as EncounterField[])
              .filter((key) => draft.notes[key] !== visit.notes[key])
              .map((key) => (
                <div className={styles.inlineNote} key={key}>
                  <h3>{encounterLabels[key]}</h3>
                  <p className={styles.reviewText}>
                    Ваш вариант: {draft.notes[key] || "Пусто"}
                  </p>
                  <p className={styles.reviewText}>
                    Сохранённый вариант: {visit.notes[key] || "Пусто"}
                  </p>
                </div>
              ))}
            <p>
              Текущий статус: {visitStatus[visit.status]}. Дата:{" "}
              {formatDate(visit.scheduledAt)}. Основание:{" "}
              {visit.rationale || "не внесено"}.
            </p>
          </details>
          <div className={styles.row} style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              onClick={() => {
                saved.current = JSON.stringify(visit);
                version.current = patient.revision;
                draftRef.current = structuredClone(visit);
                setDraft(draftRef.current);
                setConflict(false);
                setError("");
              }}
            >
              Использовать сохранённую запись
            </Button>
            {!readOnly && (
              <Button
                onClick={() => {
                  saved.current = JSON.stringify(visit);
                  version.current = patient.revision;
                  setConflict(false);
                  setError("");
                  setDraft({ ...draftRef.current });
                }}
              >
                Продолжить с моим вариантом
              </Button>
            )}
          </div>
        </Section>
      )}
      {visit.status === "cancelled" ? (
        <Section title="Приём отменён">
          <p className={styles.reviewText}>{visit.cancellationReason}</p>
        </Section>
      ) : (
        <div className={styles.editorGrid}>
          <nav className={styles.editorNav} aria-label="Разделы приёма">
            {steps.map((label, i) => (
              <button
                key={label}
                aria-current={step === i ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <span className={styles.stepNumber}>{i + 1}</span>
                <span>{label}</span>
              </button>
            ))}
            {!readOnly && (
              <Button
                variant="ghost"
                onClick={() => {
                  setCancel(true);
                  setReason("");
                }}
              >
                Отменить приём
              </Button>
            )}
          </nav>
          <div className={styles.stack}>
            <h2 className={styles.stepHeading} ref={stepHeading} tabIndex={-1}>
              {steps[step]}
            </h2>
            {readOnly && step !== 3 && (
              <div className={styles.notice}>
                Запись завершена {formatDate(visit.completedAt)}. Для уточнения
                создайте дополнение к итогу.
              </div>
            )}
            {step === 0 &&
              (readOnly ? (
                <NoteSummary visit={visit} fields={contextFields} />
              ) : (
                <div className={styles.encounterColumns}>
                  <div className={styles.stack}>
                    <Section
                      title={
                        visit.kind === "initial"
                          ? "Контекст обращения"
                          : "Что изменилось с прошлого раза"
                      }
                      description="Что изменилось, что беспокоит и что важно пациенту"
                    >
                      <div className={styles.form}>
                        {visit.kind === "initial" && (
                          <>
                            <details className={styles.details}>
                              <summary>Дата, тип и формат встречи</summary>
                              <div className={styles.form}>
                                <Field
                                  label="Дата и время"
                                  type="datetime-local"
                                  value={localDateTime(draft.scheduledAt)}
                                  onChange={(e) => {
                                    if (e.target.value)
                                      setDraft({
                                        ...draft,
                                        scheduledAt: new Date(
                                          e.target.value,
                                        ).toISOString(),
                                      });
                                  }}
                                />
                                <Select
                                  label="Формат"
                                  value={draft.format}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      format: e.target.value as Visit["format"],
                                    })
                                  }
                                >
                                  <option value="in-person">Очно</option>
                                  <option value="remote">Дистанционно</option>
                                </Select>
                              </div>
                            </details>
                            <Select
                              label="Источник сведений"
                              value={draft.provenance}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  provenance: e.target
                                    .value as Visit["provenance"],
                                })
                              }
                            >
                              <option value="patient">Со слов пациента</option>
                              <option value="clinician">Оценка врача</option>
                              <option value="relative">Со слов близкого</option>
                              <option value="document">Из документа</option>
                            </Select>
                          </>
                        )}
                        {visit.kind === "initial" ? (
                          fields(contextFields)
                        ) : (
                          <>
                            {fields(["history", "complaints"])}
                            <details className={styles.details}>
                              <summary>
                                Данные встречи и источник сведений
                              </summary>
                              <div className={styles.form}>
                                <details className={styles.details}>
                                  <summary>Дата, тип и формат встречи</summary>
                                  <div className={styles.form}>
                                    <Field
                                      label="Дата и время"
                                      type="datetime-local"
                                      value={localDateTime(draft.scheduledAt)}
                                      onChange={(e) => {
                                        if (e.target.value)
                                          setDraft({
                                            ...draft,
                                            scheduledAt: new Date(
                                              e.target.value,
                                            ).toISOString(),
                                          });
                                      }}
                                    />
                                    <Select
                                      label="Формат"
                                      value={draft.format}
                                      onChange={(e) =>
                                        setDraft({
                                          ...draft,
                                          format: e.target
                                            .value as Visit["format"],
                                        })
                                      }
                                    >
                                      <option value="in-person">Очно</option>
                                      <option value="remote">
                                        Дистанционно
                                      </option>
                                    </Select>
                                  </div>
                                </details>
                                <Select
                                  label="Источник сведений"
                                  value={draft.provenance}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      provenance: e.target
                                        .value as Visit["provenance"],
                                    })
                                  }
                                >
                                  <option value="patient">
                                    Со слов пациента
                                  </option>
                                  <option value="clinician">
                                    Оценка врача
                                  </option>
                                  <option value="relative">
                                    Со слов близкого
                                  </option>
                                  <option value="document">Из документа</option>
                                </Select>
                              </div>
                            </details>
                            <PatientContext
                              patient={patient}
                              actions={actions}
                              compact
                            />
                            <details
                              className={styles.details}
                              open={
                                contextFields.some(
                                  (key) =>
                                    !["history", "complaints"].includes(key) &&
                                    !!draft.notes[key],
                                ) || undefined
                              }
                            >
                              <summary>
                                Анамнез и дополнительные сведения
                              </summary>
                              <div className={styles.form}>
                                {fields(
                                  contextFields.filter(
                                    (key) =>
                                      !["history", "complaints"].includes(key),
                                  ),
                                )}
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                      <SourceLinks ids={["S01", "S02", "S03", "S04"]} />
                    </Section>
                    {visit.kind === "initial" && (
                      <PatientContext patient={patient} actions={actions} />
                    )}
                    <p className={styles.subtext}>
                      Прошлые записи не переносятся как новые. Укажите изменения
                      и источник текущих сведений.
                    </p>
                  </div>
                  <aside className={styles.encounterContext}>
                    <PatientBrief
                      patient={patient}
                      navigate={navigate}
                      visitId={visit.id}
                      compact
                    />
                  </aside>
                </div>
              ))}
            {step === 1 &&
              (readOnly ? (
                <NoteSummary
                  visit={visit}
                  fields={[...assessmentFields, ...safetyFields]}
                />
              ) : (
                <>
                  <Section title="Клиническая оценка">
                    <div className={styles.form}>
                      {fields(assessmentFields)}
                    </div>
                    <SourceLinks ids={["S02", "S03", "S04"]} />
                  </Section>
                  <Section
                    title="Безопасность"
                    description="Фиксируйте ответы, их давность, доступные сведения и заключение отдельно"
                  >
                    <div className={styles.form}>{fields(safetyFields)}</div>
                    <SourceLinks ids={["S02", "S03", "S10", "S25"]} />
                  </Section>
                  <Section
                    title="Измерения и шкалы"
                    action={
                      <Button
                        variant="secondary"
                        icon="plus"
                        onClick={async () => {
                          if (await save()) setMeasurement(true);
                        }}
                      >
                        Добавить оценку
                      </Button>
                    }
                  >
                    {patient.measurements
                      .filter((m) => m.visitId === visit.id)
                      .map((m) => (
                        <div className={styles.inlineNote} key={m.id}>
                          <div className={styles.between}>
                            <h3>{m.title}</h3>
                            <Badge>
                              {m.score ?? "Нет итогового балла"}
                              {m.maximum !== null ? ` / ${m.maximum}` : ""}
                            </Badge>
                          </div>
                          <p>
                            {m.version} · {m.interpretation}
                          </p>
                        </div>
                      ))}
                    {!patient.measurements.some(
                      (m) => m.visitId === visit.id,
                    ) && (
                      <p className={styles.subtext}>
                        Оценки этого приёма ещё не внесены. Набор инструментов
                        выбирает врач по клиническому контексту.
                      </p>
                    )}
                  </Section>
                </>
              ))}
            {step === 2 &&
              (readOnly ? (
                <NoteSummary
                  visit={visit}
                  fields={[
                    "diagnosis",
                    "conclusion",
                    "recommendations",
                    "patientPreference",
                  ]}
                />
              ) : (
                <>
                  <Section title="Заключение и договорённости">
                    <div className={styles.form}>
                      <Textarea
                        label={encounterLabels.diagnosis}
                        value={draft.notes.diagnosis}
                        onChange={(e) => setNote("diagnosis", e.target.value)}
                        hint="Рабочая гипотеза не равнозначна подтверждённому психиатрическому диагнозу"
                      />
                      {fields([
                        "conclusion",
                        "recommendations",
                        "patientPreference",
                      ])}
                      <Field
                        label="Рекомендуемая дата следующего контакта"
                        type="datetime-local"
                        value={
                          draft.nextVisitAt
                            ? localDateTime(draft.nextVisitAt)
                            : ""
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            nextVisitAt: e.target.value
                              ? new Date(e.target.value).toISOString()
                              : "",
                          })
                        }
                      />
                      <SourcePicker
                        value={draft.sourceIds}
                        onChange={(sourceIds) =>
                          setDraft({ ...draft, sourceIds })
                        }
                      />
                      <Textarea
                        label="Обоснование решения / применимость источников"
                        value={draft.rationale}
                        onChange={(e) =>
                          setDraft({ ...draft, rationale: e.target.value })
                        }
                      />
                    </div>
                  </Section>
                  <div
                    onFocusCapture={() => {
                      if (dirty) void save();
                    }}
                  >
                    <CarePlan
                      patient={patient}
                      actions={actions}
                      visitId={visit.id}
                    />
                  </div>
                  <Referrals
                    patient={patient}
                    actions={actions}
                    visitId={visit.id}
                  />
                </>
              ))}
            {step === 3 && (
              <>
                <VisitSummary
                  patient={patient}
                  visit={readOnly ? visit : draft}
                />
                {!readOnly && (
                  <Section title="Проверка перед завершением">
                    {errors.length ? (
                      <div className={styles.notice}>
                        <strong>Нужно дополнить</strong>
                        <ul>
                          {errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className={styles.notice}>
                        Обязательные разделы заполнены. Проверьте итог и
                        подтверждённые назначения перед завершением.
                      </div>
                    )}
                    <div className={styles.row} style={{ marginTop: 18 }}>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          if (await save()) setConsent(true);
                        }}
                      >
                        Согласие / отказ
                      </Button>
                      <Button
                        icon="check"
                        onClick={() => void review()}
                        disabled={saving}
                      >
                        Завершить приём
                      </Button>
                    </div>
                  </Section>
                )}
                {visit.status === "completed" && (
                  <Section
                    title="Подтверждение и дополнения"
                    action={
                      <Button
                        variant="secondary"
                        icon="plus"
                        onClick={() => {
                          setAddendum(true);
                          setAddition("");
                          setReason("");
                        }}
                      >
                        Добавить уточнение
                      </Button>
                    }
                  >
                    <p className={styles.subtext}>
                      Подтвердил(а): {visit.confirmedBy} ·{" "}
                      {formatDate(visit.completedAt, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {visit.addenda.map((a) => (
                      <article className={styles.inlineNote} key={a.id}>
                        <h3>
                          {formatDate(a.createdAt)} · {a.author}
                        </h3>
                        <p>{a.text}</p>
                        <small>Основание: {a.reason}</small>
                      </article>
                    ))}
                  </Section>
                )}
                {visit.status === "completed" && (
                  <Section
                    title="Следующий приём"
                    description="Запись появится в расписании и в карте пациента"
                  >
                    {patient.visits.some(
                      (v) =>
                        v.status === "scheduled" &&
                        v.scheduledAt === visit.nextVisitAt,
                    ) ? (
                      <p>Приём на рекомендованное время уже создан.</p>
                    ) : (
                      <Button icon="calendar" onClick={() => setFollowup(true)}>
                        Запланировать следующий приём
                      </Button>
                    )}
                  </Section>
                )}
              </>
            )}
            {!readOnly && (
              <div className={styles.editorFooter}>
                <Button
                  variant="secondary"
                  disabled={step === 0}
                  onClick={() => setStep(Math.max(0, step - 1))}
                >
                  Назад
                </Button>
                <span className={styles.subtext}>
                  Ctrl / ⌘ + S · сохранить черновик
                </span>
                {step < 3 && (
                  <Button icon="arrow" onClick={() => setStep(step + 1)}>
                    Продолжить
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {measurement && (
        <MeasurementForm
          patient={patient}
          actions={actions}
          visitId={visit.id}
          onClose={() => setMeasurement(false)}
        />
      )}{" "}
      {consent && (
        <ConsentForm
          patient={patient}
          actions={actions}
          onClose={() => setConsent(false)}
        />
      )}
      {followup && (
        <AppointmentForm
          patient={patient}
          actor={actions.actor}
          actions={actions}
          navigate={navigate}
          initialDate={visit.nextVisitAt || undefined}
          onClose={() => setFollowup(false)}
        />
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Подтвердить итог приёма"
      >
        <div className={styles.form}>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <h3>{patient.profile.name}</h3>
          <p className={styles.reviewText}>
            {draft.notes.conclusion || "Заключение не внесено"}
          </p>
          <p className={styles.reviewText}>
            {draft.notes.recommendations || "Рекомендации не внесены"}
          </p>
          {errors.length > 0 && (
            <ErrorNotice>
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </ErrorNotice>
          )}
          <div className={styles.notice}>
            После подтверждения запись сохраняется в истории. Уточнения
            оформляются дополнением. Это фиксация решения врача, а не
            квалифицированная электронная подпись.
          </div>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Вернуться к заполнению
            </Button>
            <Button
              disabled={actions.busy || errors.length > 0}
              onClick={() => void complete()}
            >
              Подтвердить и завершить
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={cancel || addendum}
        onClose={() => {
          setCancel(false);
          setAddendum(false);
        }}
        title={cancel ? "Отмена приёма" : "Дополнение к завершённому приёму"}
      >
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void changeStatus();
          }}
        >
          {error && <ErrorNotice>{error}</ErrorNotice>}
          {addendum && (
            <Textarea
              label="Текст дополнения"
              value={addition}
              onChange={(e) => setAddition(e.target.value)}
              required
            />
          )}
          <Textarea
            label={cancel ? "Причина отмены" : "Причина уточнения"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <div className={styles.formActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setCancel(false);
                setAddendum(false);
              }}
            >
              Назад
            </Button>
            <Button disabled={actions.busy} type="submit">
              {cancel ? "Отменить приём" : "Сохранить дополнение"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
function NoteSummary({
  visit,
  fields,
}: {
  visit: Visit;
  fields: EncounterField[];
}) {
  return (
    <Section title="Запись врача">
      <div className={styles.stack}>
        {fields.map((field) => (
          <div key={field}>
            <h3>{encounterLabels[field]}</h3>
            <p className={styles.reviewText} style={{ marginTop: 6 }}>
              {visit.notes[field] || "Не внесено"}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
export function VisitSummary({
  patient,
  visit,
}: {
  patient: PatientRecord;
  visit: Visit;
}) {
  const snapshot =
    visit.status === "completed" ? visit.completionSnapshot : null;
  const measurements =
    snapshot?.measurements ??
    patient.measurements.filter((m) => m.visitId === visit.id);
  const plan =
    snapshot?.plan ??
    patient.plan.filter((p) => p.visitId === visit.id && p.status !== "draft");
  const referrals =
    snapshot?.referrals ??
    patient.referrals.filter(
      (r) => r.visitId === visit.id && r.status !== "draft",
    );
  return (
    <Section
      title="Сводка приёма"
      description={`${snapshot?.patientName ?? patient.profile.name} · ${formatDate(visit.scheduledAt)}`}
    >
      <div className={styles.stack}>
        {summaryFields.map((field) => (
          <div key={field}>
            <h3>{encounterLabels[field]}</h3>
            <p className={styles.reviewText} style={{ marginTop: 6 }}>
              {visit.notes[field] || "Не внесено"}
            </p>
          </div>
        ))}
        <div>
          <h3>Измерения</h3>
          {measurements.map((m) => (
            <p className={styles.reviewText} key={m.id}>
              {m.title}: {m.score ?? "оценка неполная / без суммарного балла"} ·{" "}
              {m.version} · {m.interpretation}
            </p>
          ))}
        </div>
        <details className={styles.details}>
          <summary>Дополнительные разделы записи</summary>
          {(Object.keys(encounterLabels) as EncounterField[])
            .filter((field) => !summaryFields.includes(field))
            .map((field) => (
              <div className={styles.inlineNote} key={field}>
                <h3>{encounterLabels[field]}</h3>
                <p className={styles.reviewText}>
                  {visit.notes[field] || "Не внесено"}
                </p>
              </div>
            ))}
          <p className={styles.reviewText}>
            Обоснование решения: {visit.rationale || "Не внесено"}
          </p>
        </details>
        <div>
          <h3>Подтверждённый план</h3>
          {plan.map((p) => (
            <p className={styles.reviewText} key={p.id}>
              {p.title} · {p.dose} {p.schedule} · {p.patientInstructions}
            </p>
          ))}
          {patient.plan.some(
            (p) => p.visitId === visit.id && p.status === "draft",
          ) && (
            <p className={styles.subtext}>
              Есть черновики назначений. Они не входят в подтверждённый план.
            </p>
          )}
        </div>
        {referrals.length > 0 && (
          <div>
            <h3>Направления</h3>
            {referrals.map((r) => (
              <p className={styles.reviewText} key={r.id}>
                {r.destination} · {r.reason} ·{" "}
                {r.dueDate ? formatDate(r.dueDate) : "Срок не указан"}
              </p>
            ))}
          </div>
        )}
        {visit.nextVisitAt && (
          <div>
            <h3>Следующий контакт</h3>
            <p>
              {formatDate(visit.nextVisitAt, {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ·{" "}
              {patient.visits.some(
                (v) =>
                  v.status === "scheduled" &&
                  v.scheduledAt === visit.nextVisitAt,
              )
                ? "приём запланирован"
                : "рекомендованная дата"}
            </p>
          </div>
        )}
        <SourceLinks ids={visit.sourceIds} />
      </div>
    </Section>
  );
}
