import { useState, type FormEvent } from "react";
import type { Actor, PatientRecord, Provenance } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import {
  supportCatalog,
  supportSignalLabels,
  newSupportInput,
} from "./clinical-support-engine";
import { isSupportEvaluationCurrent } from "./clinical-support";
import compactStyles from "./clinical-rows.module.css";
import {
  clinicalSignals,
  seriousnessCriteria,
  type ClinicalObservation,
  type SupportInput,
  type SupportSource,
  type SupportOptionResult,
  type SupportDecision,
  type SupportFinding,
  type AdverseEventInput,
  type AdverseEventRecord,
} from "./clinical-support-types";
import {
  Badge,
  Button,
  Field,
  Select,
  Textarea,
  Modal,
  ErrorNotice,
  styles,
} from "./ui/Elements";

const optionTitle = (value: string) => value.replace("безопасности", "рисков");

const origins: Record<Provenance, string> = {
  clinician: "Сведения врача",
  patient: "Со слов пациента",
  relative: "Со слов близкого",
  document: "Из документа",
};
const answers = { yes: "Да", no: "Нет", unknown: "Неизвестно" };
const optionStatuses = {
  discuss: "Для обсуждения",
  clarify: "Нужно уточнить",
  defer: "Отложен до уточнения",
};
const decisionLabels = {
  accept: "Принято",
  decline: "Отклонено",
  defer: "Отложено",
};
const severityLabels = {
  unknown: "Не оценена",
  mild: "Лёгкая",
  moderate: "Умеренная",
  severe: "Выраженная",
};
const seriousnessLabels = {
  unknown: "Не оценена",
  "not-serious": "Несерьёзное",
  serious: "Серьёзное",
};
const criterionLabels: Record<AdverseEventInput["criteria"][number], string> = {
  death: "Смерть",
  "life-threatening": "Угроза жизни в момент события",
  hospitalization: "Госпитализация или её продление",
  disability: "Стойкая или значимая утрата трудоспособности",
  congenital: "Врождённая аномалия",
  "medically-important": "Иное медицински значимое событие",
};
const outcomeLabels = {
  unknown: "Неизвестен",
  ongoing: "Продолжается",
  recovering: "Улучшение",
  recovered: "Выздоровление",
  sequelae: "Остаточные последствия",
  fatal: "Летальный исход",
};
const dechallengeLabels = {
  unknown: "Неизвестно",
  "not-done": "Не проводилась",
  improved: "Стало лучше",
  unchanged: "Без изменений",
};
const rechallengeLabels = {
  unknown: "Неизвестно",
  "not-done": "Не проводилось",
  recurred: "Явление повторилось",
  "not-recurred": "Не повторилось",
};
const causalityLabels = {
  unassessed: "Не оценена",
  unlikely: "Маловероятная",
  possible: "Возможная",
  probable: "Вероятная",
  certain: "Определённая",
  unclassifiable: "Недостаточно данных для оценки",
};
const dateText = (at: string) => new Date(at).toLocaleString("ru-RU");
function localTime(at: string) {
  if (!at || !Number.isFinite(Date.parse(at))) return "";
  const d = new Date(at);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function instant(value: string) {
  return value ? new Date(value).toISOString() : "";
}
function choices(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}
function initialInput(saved?: SupportInput): SupportInput {
  const base = structuredClone(saved ?? newSupportInput());
  const at = new Date().toISOString();
  base.observations = clinicalSignals.map(
    (key) =>
      base.observations.find((o) => o.key === key) ?? {
        key,
        answer: "unknown",
        provenance: "clinician",
        observedAt: at,
        note: "",
      },
  );
  return base;
}
function Sources({
  ids,
  sources = supportCatalog.sources,
}: {
  ids: string[];
  sources?: SupportSource[];
}) {
  return (
    <details className={styles.details}>
      <summary>Источники и ограничения</summary>
      {sources
        .filter((s) => ids.includes(s.id))
        .map((s) => (
          <div className={styles.smallStack} key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
            <p className={styles.subtext}>
              {s.version} · {s.section}
            </p>
            <p className={styles.subtext}>{s.limitation}</p>
          </div>
        ))}
    </details>
  );
}

function AdverseEditor({
  patient,
  actions,
  record,
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  record?: AdverseEventRecord;
  onClose: () => void;
}) {
  const original = record?.versions.at(-1);
  const [id] = useState(record?.id ?? crypto.randomUUID());
  const [version] = useState(original?.version ?? 0);
  const [value, setValue] = useState<AdverseEventInput>(() =>
    structuredClone(
      original?.input ?? {
        symptoms: "",
        onsetAt: new Date().toISOString(),
        suspectPlanIds: [],
        severity: "unknown",
        seriousness: "unknown",
        criteria: [],
        outcome: "unknown",
        dechallenge: "unknown",
        rechallenge: "unknown",
        causality: "unassessed",
        provenance: "clinician",
        assessment: "",
      },
    ),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const set = <K extends keyof AdverseEventInput>(
    key: K,
    v: AdverseEventInput[K],
  ) => setValue((old) => ({ ...old, [key]: v }));
  const medication = patient.plan.filter(
    (p) => p.kind === "medication" && p.status !== "draft",
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError("");
    if (pending || actions.busy) return;
    try {
      if (!value.symptoms.trim())
        throw new Error("Опишите симптомы и проявления.");
      if (value.seriousness === "serious" && !value.criteria.length)
        throw new Error("Укажите хотя бы один критерий серьёзности.");
      if (value.seriousness !== "serious" && value.criteria.length)
        throw new Error("Сверьте серьёзность исхода и отмеченные критерии.");
      if (!value.onsetAt || Date.parse(value.onsetAt) > Date.now())
        throw new Error("Укажите дату начала, которая уже наступила.");
      if (
        value.outcome === "fatal" &&
        (value.seriousness !== "serious" || !value.criteria.includes("death"))
      )
        throw new Error(
          "Для летального исхода укажите серьёзность и критерий «Смерть».",
        );
      if (value.causality !== "unassessed" && !value.assessment.trim())
        throw new Error("Обоснуйте оценку причинной связи.");
      if (version && !reason.trim())
        throw new Error("Укажите причину изменения записи.");
      const current = patient.clinicalSupport?.adverseEvents
        .find((r) => r.id === id)
        ?.versions.at(-1);
      if ((current?.version ?? 0) !== version)
        throw new Error(
          "Запись изменена. Закройте форму и откройте актуальную версию.",
        );
      setPending(true);
      await actions.mutate(
        patient.id,
        {
          type: "support.adverse",
          id,
          expectedVersion: version,
          input: value,
          reason,
        },
        patient.revision,
      );
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={
        record ? "Уточнить нежелательное явление" : "Нежелательное явление"
      }
    >
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Textarea
          label="Симптомы и проявления"
          value={value.symptoms}
          onChange={(e) => set("symptoms", e.target.value)}
          required
          rows={3}
        />
        <Field
          label="Начало явления"
          type="datetime-local"
          value={localTime(value.onsetAt)}
          onChange={(e) => set("onsetAt", instant(e.target.value))}
          required
        />
        <Select
          label="Источник сведений о явлении"
          value={value.provenance}
          onChange={(e) => set("provenance", e.target.value as Provenance)}
        >
          {choices(origins)}
        </Select>
        <fieldset className={styles.smallStack}>
          <legend>Подозреваемые лекарственные назначения</legend>
          {medication.length ? (
            medication.map((p) => (
              <label key={p.id} className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={value.suspectPlanIds.includes(p.id)}
                  onChange={(e) =>
                    set(
                      "suspectPlanIds",
                      e.target.checked
                        ? [...value.suspectPlanIds, p.id]
                        : value.suspectPlanIds.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>
                  {p.title} · {p.dose} · {p.startDate || "Дата не указана"}
                </span>
              </label>
            ))
          ) : (
            <p className={styles.subtext}>
              Лекарственных назначений для выбора нет. Укажите предполагаемое
              средство в описании.
            </p>
          )}
        </fieldset>
        <Select
          label="Выраженность симптомов"
          value={value.severity}
          onChange={(e) =>
            set("severity", e.target.value as AdverseEventInput["severity"])
          }
        >
          {choices(severityLabels)}
        </Select>
        <Select
          label="Серьёзность исхода"
          hint="Серьёзность определяется исходом и критериями, а не силой симптомов."
          value={value.seriousness}
          onChange={(e) =>
            set(
              "seriousness",
              e.target.value as AdverseEventInput["seriousness"],
            )
          }
        >
          {choices(seriousnessLabels)}
        </Select>
        {(value.seriousness === "serious" || value.criteria.length > 0) && (
          <fieldset className={styles.smallStack}>
            <legend>Критерии серьёзности</legend>
            {seriousnessCriteria.map((c) => (
              <label key={c} className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={value.criteria.includes(c)}
                  onChange={(e) =>
                    set(
                      "criteria",
                      e.target.checked
                        ? [...value.criteria, c]
                        : value.criteria.filter((v) => v !== c),
                    )
                  }
                />
                <span>{criterionLabels[c]}</span>
              </label>
            ))}
          </fieldset>
        )}
        <Select
          label="Исход явления"
          value={value.outcome}
          onChange={(e) =>
            set("outcome", e.target.value as AdverseEventInput["outcome"])
          }
        >
          {choices(outcomeLabels)}
        </Select>
        <details className={styles.details}>
          <summary>Отмена, повторное применение и причинность</summary>
          <div className={styles.form}>
            <Select
              label="Результат отмены подозреваемого средства"
              value={value.dechallenge}
              onChange={(e) =>
                set(
                  "dechallenge",
                  e.target.value as AdverseEventInput["dechallenge"],
                )
              }
            >
              {choices(dechallengeLabels)}
            </Select>
            <Select
              label="Результат повторного применения"
              hint="Фиксируется только уже произошедший факт. Повторное применение для проверки не предлагается."
              value={value.rechallenge}
              onChange={(e) =>
                set(
                  "rechallenge",
                  e.target.value as AdverseEventInput["rechallenge"],
                )
              }
            >
              {choices(rechallengeLabels)}
            </Select>
            <Select
              label="Причинная связь с препаратом"
              value={value.causality}
              onChange={(e) =>
                set(
                  "causality",
                  e.target.value as AdverseEventInput["causality"],
                )
              }
            >
              {choices(causalityLabels)}
            </Select>
            <Textarea
              label="Обоснование врачебной оценки"
              value={value.assessment}
              onChange={(e) => set("assessment", e.target.value)}
              rows={3}
            />
          </div>
        </details>
        {version > 0 && (
          <Textarea
            label="Причина изменения записи"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={2}
          />
        )}
        <Sources ids={["ich-e2d", "who-umc"]} />
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={actions.busy || pending || patient.archived}
          >
            {pending ? "Сохранение…" : "Сохранить явление"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ClinicalSupportPanelContent({
  patient,
  actor,
  actions,
}: {
  patient: PatientRecord;
  actor: Actor;
  actions: WorkspaceActions;
}) {
  const state = patient.clinicalSupport;
  const latest = state?.evaluations.at(-1);
  const [input, setInput] = useState<SupportInput>(() =>
    initialInput(latest?.input),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [adverse, setAdverse] = useState<"new" | string | null>(null);
  const [selection, setSelection] = useState<{
    id: string;
    evaluationId: string;
    option: SupportOptionResult;
    decision: SupportDecision["decision"];
  } | null>(null);
  const [routeSelection, setRouteSelection] = useState<{
    id: string;
    evaluationId: string;
    finding: SupportFinding;
    decision: SupportDecision["decision"];
  } | null>(null);
  const [reason, setReason] = useState("");
  const stale = !!latest && !isSupportEvaluationCurrent(patient, latest, actor);
  const selectionStale =
    stale || (!!selection && selection.evaluationId !== latest?.id);
  const routeStale =
    stale || (!!routeSelection && routeSelection.evaluationId !== latest?.id);
  const busy = pending || actions.busy || patient.archived;
  const update = <K extends keyof SupportInput>(
    key: K,
    value: SupportInput[K],
  ) => setInput((old) => ({ ...old, [key]: value }));
  const observation = (
    key: ClinicalObservation["key"],
    patch: Partial<ClinicalObservation>,
  ) =>
    update(
      "observations",
      input.observations.map((o) => (o.key === key ? { ...o, ...patch } : o)),
    );
  async function evaluate(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (busy) return;
    try {
      for (const o of input.observations) {
        if (!o.observedAt || Date.parse(o.observedAt) > Date.now())
          throw new Error(`Проверьте дату: ${supportSignalLabels[o.key]}.`);
        if (o.provenance === "document" && !o.note.trim())
          throw new Error(`Укажите документ: ${supportSignalLabels[o.key]}.`);
      }
      setPending(true);
      await actions.mutate(
        patient.id,
        { type: "support.evaluate", id: crypto.randomUUID(), input },
        patient.revision,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  }
  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!selection || !latest || busy) return;
    setError("");
    try {
      if (selectionStale)
        throw new Error("Оценка устарела. Сопоставьте варианты заново.");
      if (
        (selection.decision !== "accept" ||
          selection.option.status !== "discuss") &&
        !reason.trim()
      )
        throw new Error("Укажите основание решения.");
      setPending(true);
      await actions.mutate(
        patient.id,
        {
          type: "support.decide",
          id: selection.id,
          evaluationId: selection.evaluationId,
          optionId: selection.option.id,
          decision: selection.decision,
          reason,
        },
        patient.revision,
      );
      setSelection(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  }
  async function route(event: FormEvent) {
    event.preventDefault();
    if (!routeSelection || !latest || busy) return;
    setError("");
    try {
      if (routeStale)
        throw new Error("Оценка устарела. Сопоставьте варианты заново.");
      if (routeSelection.decision !== "accept" && !reason.trim())
        throw new Error("Укажите основание решения.");
      setPending(true);
      await actions.mutate(
        patient.id,
        {
          type: "support.route",
          id: routeSelection.id,
          evaluationId: routeSelection.evaluationId,
          findingId: routeSelection.finding.id,
          decision: routeSelection.decision,
          reason,
        },
        patient.revision,
      );
      setRouteSelection(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Клиническая поддержка">
      <div className={styles.sectionHeading}>
        <div>
          <h2>Клиническая поддержка</h2>
        </div>
      </div>
      {error && !selection && !routeSelection && (
        <ErrorNotice>{error}</ErrorNotice>
      )}
      <form className={styles.form} onSubmit={evaluate}>
        <div className={styles.formPair}>
          <Select
            label="Клинический маршрут"
            value={input.route}
            onChange={(e) =>
              update("route", e.target.value as SupportInput["route"])
            }
          >
            {choices({
              gad: "ГТР / тревожные симптомы",
              depression: "Депрессивные симптомы",
            })}
          </Select>
          <Select
            label="Повседневное функционирование"
            value={input.functioning}
            onChange={(e) =>
              update(
                "functioning",
                e.target.value as SupportInput["functioning"],
              )
            }
          >
            {choices({
              unknown: "Не уточнено",
              preserved: "Сохранено",
              impaired: "Нарушено",
              "severely-impaired": "Значительно нарушено",
            })}
          </Select>
        </div>
        {input.route === "depression" && (
          <Select
            label="Клиническая выраженность депрессии"
            hint="Уточняется врачом; не устанавливается по одной сумме шкалы."
            value={input.depressionSeverity}
            onChange={(e) =>
              update(
                "depressionSeverity",
                e.target.value as SupportInput["depressionSeverity"],
              )
            }
          >
            {choices({
              unknown: "Не уточнена",
              "less-severe": "Менее выраженная",
              "more-severe": "Более выраженная",
            })}
          </Select>
        )}
        <div className={styles.formPair}>
          <Select
            label="Ответ на предыдущее лечение"
            value={input.response}
            onChange={(e) =>
              update("response", e.target.value as SupportInput["response"])
            }
          >
            {choices({
              unknown: "Не уточнён",
              "not-started": "Лечение не начато",
              improving: "Улучшение",
              "no-response": "Нет достаточного ответа",
              worsening: "Ухудшение",
            })}
          </Select>
          <Select
            label="Предпочтения пациента"
            value={input.preference}
            onChange={(e) =>
              update("preference", e.target.value as SupportInput["preference"])
            }
          >
            {choices({
              undecided: "Не определены",
              psychological: "Психологическая помощь",
              medication: "Лекарственный вариант",
              combined: "Сочетание методов",
            })}
          </Select>
        </div>
        <details className={styles.details}>
          <summary>
            Клинические сведения · уточнено{" "}
            {input.observations.filter((o) => o.answer !== "unknown").length} из{" "}
            {clinicalSignals.length}
          </summary>
          {input.observations.map((o) => (
            <div className={compactStyles.observation} key={o.key}>
              <div
                className={compactStyles.row}
                role="group"
                aria-labelledby={`observation-${patient.id}-${o.key}`}
              >
                <span id={`observation-${patient.id}-${o.key}`}>
                  {supportSignalLabels[o.key]}
                </span>
                <div className={compactStyles.answers}>
                  {Object.entries(answers).map(([answer, label]) => (
                    <label className={compactStyles.answer} key={answer}>
                      <input
                        type="radio"
                        name={`observation-${patient.id}-${o.key}`}
                        value={answer}
                        checked={o.answer === answer}
                        onChange={() =>
                          observation(o.key, {
                            answer: answer as ClinicalObservation["answer"],
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <details className={compactStyles.evidence}>
                <summary
                  aria-label={`Источник и детали · ${supportSignalLabels[o.key]}`}
                >
                  Источник и детали
                </summary>
                <div className={styles.form}>
                  <Select
                    label={`Источник · ${supportSignalLabels[o.key]}`}
                    value={o.provenance}
                    onChange={(e) =>
                      observation(o.key, {
                        provenance: e.target.value as Provenance,
                      })
                    }
                  >
                    {choices(origins)}
                  </Select>
                  <Field
                    label={`Дата сведений · ${supportSignalLabels[o.key]}`}
                    type="datetime-local"
                    value={localTime(o.observedAt)}
                    onChange={(e) =>
                      observation(o.key, {
                        observedAt: instant(e.target.value),
                      })
                    }
                  />
                  <Textarea
                    label={`Основание · ${supportSignalLabels[o.key]}`}
                    value={o.note}
                    onChange={(e) =>
                      observation(o.key, { note: e.target.value })
                    }
                    rows={2}
                  />
                </div>
              </details>
            </div>
          ))}
        </details>
        <Textarea
          label="Дополнительный контекст для оценки"
          value={input.note}
          onChange={(e) => update("note", e.target.value)}
          rows={2}
        />
        <div className={styles.formActions}>
          <Button type="submit" disabled={busy}>
            {pending && !selection ? "Сопоставление…" : "Сопоставить варианты"}
          </Button>
        </div>
      </form>
      {latest ? (
        <div className={styles.stack}>
          <div className={styles.between}>
            <h3>
              Сохранённая оценка ·{" "}
              {latest.input.route === "gad" ? "ГТР" : "Депрессивные симптомы"}
            </h3>
            <span className={styles.subtext}>
              {dateText(latest.createdAt)} · {latest.by.name}
            </span>
          </div>
          {stale && (
            <p role="status" className={styles.notice}>
              Оценка устарела: данные карты, источники или контекст врача
              изменились. Сопоставьте варианты заново.
            </p>
          )}
          {latest.result.findings.map((f) => (
            <article
              key={f.id}
              className={
                f.priority === "urgent" ? styles.notice : styles.inlineNote
              }
            >
              <div className={styles.row}>
                <Badge
                  tone={
                    f.priority === "urgent"
                      ? "red"
                      : f.priority === "important"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {f.category === "required"
                    ? "Обязательно"
                    : f.category === "desirable"
                      ? "Желательно"
                      : f.priority === "urgent"
                        ? "Срочно"
                        : f.priority === "important"
                          ? "Требует внимания"
                          : "Для рассмотрения"}
                </Badge>
                <strong>{f.title}</strong>
              </div>
              <p>{f.detail}</p>
              <Sources ids={f.sourceIds} sources={latest.sources} />
              {f.action === "consultation" &&
                (() => {
                  const saved = state?.routeDecisions?.find(
                    (d) => d.evaluationId === latest.id && d.findingId === f.id,
                  );
                  return saved ? (
                    <p className={styles.subtext}>
                      {decisionLabels[saved.decision]} ·{" "}
                      {saved.reason || "Маршрут согласован"}
                      {saved.referralId
                        ? " · Проект направления подготовлен; выдаётся отдельно"
                        : ""}
                    </p>
                  ) : (
                    <div className={styles.row}>
                      {(["accept", "decline", "defer"] as const).map(
                        (decision) => (
                          <Button
                            key={decision}
                            variant={
                              decision === "accept" ? "secondary" : "ghost"
                            }
                            disabled={busy || stale}
                            onClick={() => {
                              setError("");
                              setReason("");
                              setRouteSelection({
                                id: crypto.randomUUID(),
                                evaluationId: latest.id,
                                finding: f,
                                decision,
                              });
                            }}
                          >
                            {decision === "accept"
                              ? "Подготовить направление"
                              : decision === "decline"
                                ? "Отклонить направление"
                                : "Отложить направление"}
                          </Button>
                        ),
                      )}
                    </div>
                  );
                })()}
            </article>
          ))}
          <h3>Сравнение вариантов</h3>
          {latest.result.options.map((option) => {
            const saved = state?.decisions.find(
              (d) => d.evaluationId === latest.id && d.optionId === option.id,
            );
            return (
              <article
                key={option.id}
                className={styles.inlineNote}
                aria-label={`Вариант: ${optionTitle(option.title)}`}
              >
                <div className={styles.between}>
                  <h4>{optionTitle(option.title)}</h4>
                  <Badge
                    tone={option.status === "discuss" ? "neutral" : "amber"}
                  >
                    {optionStatuses[option.status]}
                  </Badge>
                </div>
                <p>{option.summary}</p>
                {option.reasons.length > 0 && (
                  <p className={styles.subtext}>{option.reasons.join(" ")}</p>
                )}
                <details className={styles.details}>
                  <summary>Что контролировать</summary>
                  <ul>
                    {option.monitoring.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                </details>
                <Sources ids={option.sourceIds} sources={latest.sources} />
                {saved ? (
                  <p className={styles.subtext}>
                    {decisionLabels[saved.decision]} ·{" "}
                    {saved.reason || "Вариант согласован"}
                    {saved.planId
                      ? " · Проект добавлен в план; подтверждается отдельно"
                      : ""}
                  </p>
                ) : (
                  <div className={styles.row}>
                    {(["accept", "decline", "defer"] as const).map(
                      (decision) => (
                        <Button
                          key={decision}
                          variant={
                            decision === "accept" ? "secondary" : "ghost"
                          }
                          disabled={
                            busy ||
                            stale ||
                            (option.status === "defer" &&
                              decision !== "decline")
                          }
                          onClick={() => {
                            setError("");
                            setReason("");
                            setSelection({
                              id: crypto.randomUUID(),
                              evaluationId: latest.id,
                              option,
                              decision,
                            });
                          }}
                        >
                          {decision === "accept"
                            ? "Принять"
                            : decision === "decline"
                              ? "Отклонить"
                              : "Отложить"}
                        </Button>
                      ),
                    )}
                  </div>
                )}
              </article>
            );
          })}
          <details className={styles.details}>
            <summary>Сверка лекарств и версия оценки</summary>
            {latest.result.recognizedMedicines.map((m) => (
              <p key={m.id}>
                {m.title} · {m.inn}
              </p>
            ))}
            {latest.result.unknownMedicines.length > 0 && (
              <p>
                Требуют отдельной проверки:{" "}
                {latest.result.unknownMedicines.join("; ")}
              </p>
            )}
            <p className={styles.subtext}>
              {latest.catalogVersion} · Обзор литературы; врачебная подпись об
              утверждении правил не записана.
            </p>
            <p className={styles.subtext}>
              Класс в рекомендациях не подтверждает показание конкретного РУ.
              Препарат выбирается из ГРЛС и проверяется по инструкции.
            </p>
          </details>
        </div>
      ) : (
        <p className={styles.subtext}>
          Сохранённой оценки пока нет. Уточните известные сведения и сопоставьте
          варианты.
        </p>
      )}
      <div className={styles.between}>
        <h3>Нежелательные явления</h3>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setAdverse("new")}
        >
          Записать нежелательное явление
        </Button>
      </div>
      {state?.adverseEvents.length ? (
        state.adverseEvents.map((record) => {
          const last = record.versions.at(-1)!;
          return (
            <article className={styles.inlineNote} key={record.id}>
              <div className={styles.between}>
                <strong>{last.input.symptoms}</strong>
                <Badge
                  tone={last.input.seriousness === "serious" ? "red" : "amber"}
                >
                  {seriousnessLabels[last.input.seriousness]}
                </Badge>
              </div>
              <p className={styles.subtext}>
                Выраженность: {severityLabels[last.input.severity]} · Начало:{" "}
                {dateText(last.input.onsetAt)} ·{" "}
                {origins[last.input.provenance]}
              </p>
              <p className={styles.subtext}>
                Причинность: {causalityLabels[last.input.causality]} · Исход:{" "}
                {outcomeLabels[last.input.outcome]}
              </p>
              <details className={styles.details}>
                <summary>История · {record.versions.length}</summary>
                {record.versions
                  .slice()
                  .reverse()
                  .map((v) => (
                    <div key={v.version} className={styles.smallStack}>
                      <p>
                        Версия {v.version} · {dateText(v.createdAt)} ·{" "}
                        {v.by.name}
                      </p>
                      <p>{v.input.symptoms}</p>
                      <p className={styles.subtext}>
                        {severityLabels[v.input.severity]} ·{" "}
                        {seriousnessLabels[v.input.seriousness]} ·{" "}
                        {v.input.criteria
                          .map((c) => criterionLabels[c])
                          .join("; ")}
                      </p>
                      <p>{v.input.assessment}</p>
                      <p>{v.reason}</p>
                      {v.plans.map((p) => (
                        <p className={styles.subtext} key={p.id}>
                          {p.title} · {p.dose} · {p.schedule}
                        </p>
                      ))}
                    </div>
                  ))}
              </details>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setAdverse(record.id)}
              >
                Уточнить запись
              </Button>
            </article>
          );
        })
      ) : (
        <p className={styles.subtext}>
          Явлений не зарегистрировано. Это не заключение об отсутствии
          нежелательных реакций.
        </p>
      )}
      {state && state.evaluations.length > 1 && (
        <details className={styles.details}>
          <summary>История оценок · {state.evaluations.length - 1}</summary>
          {state.evaluations
            .slice(0, -1)
            .reverse()
            .map((e) => (
              <div className={styles.smallStack} key={e.id}>
                <p>
                  {dateText(e.createdAt)} · {e.by.name} ·{" "}
                  {e.input.route === "gad" ? "ГТР" : "Депрессивные симптомы"}
                </p>
                <p className={styles.subtext}>{e.catalogVersion}</p>
                {state.decisions
                  .filter((d) => d.evaluationId === e.id)
                  .map((d) => (
                    <p key={d.id}>
                      {optionTitle(d.option.title)} ·{" "}
                      {decisionLabels[d.decision]} · {d.reason}
                    </p>
                  ))}
                {state.routeDecisions
                  ?.filter((d) => d.evaluationId === e.id)
                  .map((d) => (
                    <div key={d.id} className={styles.smallStack}>
                      <p>
                        {d.finding.title} · {decisionLabels[d.decision]} ·{" "}
                        {dateText(d.createdAt)} · {d.by.name}
                      </p>
                      <p>{d.finding.detail}</p>
                      <p>{d.reason}</p>
                      <Sources ids={d.finding.sourceIds} sources={e.sources} />
                    </div>
                  ))}
              </div>
            ))}
        </details>
      )}
      <Modal
        open={!!selection}
        onClose={() => setSelection(null)}
        title="Решение по варианту"
      >
        {selection && (
          <form className={styles.form} onSubmit={decide}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <h3>{optionTitle(selection.option.title)}</h3>
            <p>{decisionLabels[selection.decision]}</p>
            {selectionStale && (
              <p className={styles.notice}>
                Оценка устарела. Сначала сопоставьте варианты заново.
              </p>
            )}
            {selection.decision === "accept" && (
              <p className={styles.subtext}>
                Будет создан проект в плане. Клиническое действие подтверждается
                отдельно; для лекарства нужен выбор конкретного РУ и инструкции.
              </p>
            )}
            <Textarea
              label="Основание решения"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={
                selection.decision !== "accept" ||
                selection.option.status !== "discuss"
              }
              rows={3}
            />
            <div className={styles.formActions}>
              <Button variant="secondary" onClick={() => setSelection(null)}>
                Назад
              </Button>
              <Button type="submit" disabled={busy || selectionStale}>
                Сохранить решение
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!routeSelection}
        onClose={() => setRouteSelection(null)}
        title="Решение о направлении"
      >
        {routeSelection && (
          <form className={styles.form} onSubmit={route}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <h3>{routeSelection.finding.title}</h3>
            <p>{routeSelection.finding.detail}</p>
            <p>{decisionLabels[routeSelection.decision]}</p>
            {routeStale && (
              <p className={styles.notice}>
                Оценка устарела. Сначала сопоставьте варианты заново.
              </p>
            )}
            {routeSelection.decision === "accept" && (
              <p className={styles.subtext}>
                Будет подготовлен проект направления. Выдача подтверждается
                отдельно в направлениях.
                {routeSelection.finding.priority === "urgent"
                  ? " Подготовка проекта не заменяет организацию срочной помощи."
                  : ""}
              </p>
            )}
            <Textarea
              label="Основание решения о направлении"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={routeSelection.decision !== "accept"}
              rows={3}
            />
            <div className={styles.formActions}>
              <Button
                variant="secondary"
                onClick={() => setRouteSelection(null)}
              >
                Назад
              </Button>
              <Button type="submit" disabled={busy || routeStale}>
                Сохранить решение о направлении
              </Button>
            </div>
          </form>
        )}
      </Modal>
      {adverse && (
        <AdverseEditor
          patient={patient}
          actions={actions}
          record={
            adverse === "new"
              ? undefined
              : state?.adverseEvents.find((r) => r.id === adverse)
          }
          onClose={() => setAdverse(null)}
        />
      )}
    </section>
  );
}

export function ClinicalSupportPanel(props: {
  patient: PatientRecord;
  actor: Actor;
  actions: WorkspaceActions;
}) {
  return <ClinicalSupportPanelContent key={props.patient.id} {...props} />;
}
