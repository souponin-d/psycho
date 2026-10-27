import { ClinicalQuestionnaire } from "./ClinicalQuestionnaire";
import { useState, type FormEvent } from "react";
import type { PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import {
  workflowComparison,
  workflowActionLabels,
  workflowStatusLabels,
  safetyStageLabels,
  isWorkflowRecommendationCurrent,
  type WorkflowRecommendation,
  type WorkflowDecision,
  type WorkflowAction,
  type WorkflowSafety,
  type SafetyStage,
} from "./clinical-workflow";
import { clinicalScenarios, scenarioMutations } from "./clinical-scenarios";
import { getClinicalProtocol } from "./clinical-protocols";
import { formatDate } from "./labels";
import {
  Button,
  Field,
  Select,
  Textarea,
  Modal,
  ErrorNotice,
  styles,
} from "./ui/Elements";

export function WorkflowChanges({ patient }: { patient: PatientRecord }) {
  const latestMessage = patient.messages
    .filter((entry) => entry.direction === "patient" && entry.text.trim())
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <section
      className={styles.contextCard}
      aria-label="Вопрос пациента перед приёмом"
    >
      <h3>Вопрос пациента перед приёмом</h3>
      {latestMessage ? (
        <>
          <p className={styles.reviewText}>{latestMessage.text}</p>
          <p className={styles.subtext}>
            Сообщение пациента · {formatDate(latestMessage.createdAt)}
          </p>
        </>
      ) : (
        <p className={styles.subtext}>
          Вопросов в сообщениях пациента пока нет.
        </p>
      )}
    </section>
  );
}

export function WorkflowRecommendations({
  patient,
  actions,
  onlyId,
}: {
  patient: PatientRecord;
  actions?: WorkspaceActions;
  onlyId?: string;
}) {
  const [selection, setSelection] = useState<{
    r: WorkflowRecommendation;
    decision: WorkflowDecision;
    revision: number;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<WorkflowAction>("discuss");
  const [dueDate, setDueDate] = useState("");
  const [destination, setDestination] = useState("");
  const [projectReason, setProjectReason] = useState("");
  const [error, setError] = useState("");
  const [execute, setExecute] = useState<{
    r: WorkflowRecommendation;
    revision: number;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const rows = (patient.workflow?.recommendations ?? [])
    .filter((r) => !r.stale && (!onlyId || r.id === onlyId))
    .slice()
    .sort(
      (a, b) =>
        ({ urgent: 0, important: 1, routine: 2 })[a.priority] -
        { urgent: 0, important: 1, routine: 2 }[b.priority],
    );
  const history = (patient.workflow?.recommendations ?? []).filter(
    (r) => r.stale && (!onlyId || r.id === onlyId),
  );
  const writable = !!actions && !patient.archived;
  function isCurrent(r: WorkflowRecommendation) {
    const latest = patient.workflow?.recommendations.find(
      (entry) => entry.id === r.id,
    );
    return (
      !r.stale &&
      !!latest &&
      !latest.stale &&
      latest.version === r.version &&
      isWorkflowRecommendationCurrent(patient, latest, actions?.actor)
    );
  }
  const needsRefresh = rows.some((r) => !isCurrent(r));
  function choose(r: WorkflowRecommendation, decision: WorkflowDecision) {
    if (!isCurrent(r)) return;
    setSelection({ r, decision, revision: patient.revision });
    setReason("");
    setAction(r.action);
    setDueDate(r.dueDate);
    setDestination(r.destination);
    setProjectReason(r.referralReason ?? r.rationale);
    setError("");
  }
  async function decide(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!selection || !actions || !isCurrent(selection.r)) return;
    try {
      await actions.mutate(
        patient.id,
        {
          type: "workflow.decide",
          id: selection.r.id,
          expectedVersion: selection.r.version,
          decision: selection.decision,
          reason,
          action,
          dueDate,
          destination,
          ...(["consultation", "investigation"].includes(action)
            ? { projectReason }
            : {}),
        },
        selection.revision,
      );
      setSelection(null);
    } catch (err) {
      setError(message(err));
    }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!execute || !actions || !confirmed || !isCurrent(execute.r)) return;
    try {
      await actions.mutate(
        patient.id,
        {
          type: "workflow.execute",
          id: execute.r.id,
          expectedVersion: execute.r.version,
          confirmation: true,
        },
        execute.revision,
      );
      setExecute(null);
    } catch (err) {
      setError(message(err));
    }
  }
  function card(r: WorkflowRecommendation) {
    return (
      <article
        className={styles.inlineNote}
        key={r.id}
        aria-label={`Рекомендация: ${r.title}`}
      >
        <div className={styles.between}>
          <strong>{r.title}</strong>
          <span>{workflowStatusLabels[r.status]}</span>
        </div>
        <p>{r.rationale}</p>
        <p>
          {workflowActionLabels[r.action]} ·{" "}
          {r.priority === "urgent"
            ? "Срочно"
            : r.priority === "important"
              ? "Приоритетно"
              : "Планово"}
          {r.dueDate
            ? ` · срок ${formatDate(r.dueDate)}`
            : " · срок не назначен"}
        </p>
        {r.referralCategory && (
          <p>
            Категория направления:{" "}
            {r.referralCategory === "required" ? "Обязательно" : "Желательно"}
          </p>
        )}
        <details className={styles.details}>
          <summary>Основания, ограничения и решения</summary>
          <p className={styles.subtext}>
            {r.source.id}/{r.source.version} · {r.source.status} · {r.id}
          </p>
          <p>{r.source.source} · Клиническое утверждение отсутствует.</p>
          <p>{r.limitations}</p>
          {r.ruleId && (
            <p>
              Правило: {r.ruleId} · {r.ruleVersion}
            </p>
          )}
          <p>
            Связанные факты: {r.factIds.join(", ") || "нет"}; оценка:{" "}
            {r.assessmentId || "нет"}
          </p>
          {r.history.map((h, i) => (
            <p key={i}>
              {formatDate(h.at)} · {h.by.name} · {h.decision} ·{" "}
              {h.reason || "Стандартное решение без дополнительной причины"}
            </p>
          ))}
        </details>
        {r.effectId && (
          <p>
            <a href={`#/patients/${patient.id}/plan`}>Открыть план</a>
          </p>
        )}
        {writable &&
          isCurrent(r) &&
          ["new", "open", "deferred", "accepted", "modified"].includes(
            r.status,
          ) && (
            <div className={styles.row}>
              {(
                [
                  ["accept", "Принять"],
                  ["modify", "Изменить"],
                  ["reject", "Отклонить"],
                  ["defer", "Отложить до приёма"],
                ] as const
              )
                .filter(
                  ([decision]) =>
                    ["new", "open", "deferred"].includes(r.status) ||
                    decision === "modify" ||
                    decision === "reject",
                )
                .map(([decision, label]) => (
                  <Button
                    key={decision}
                    type="button"
                    variant={decision === "accept" ? "secondary" : "ghost"}
                    disabled={actions!.busy}
                    onClick={() => choose(r, decision)}
                  >
                    {label}
                  </Button>
                ))}
            </div>
          )}
        {writable &&
          isCurrent(r) &&
          ["accepted", "modified"].includes(r.status) && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setExecute({ r, revision: patient.revision });
                setConfirmed(false);
                setError("");
              }}
            >
              Проверить и подтвердить действие
            </Button>
          )}
        {!isCurrent(r) && <p>Основание изменилось</p>}
      </article>
    );
  }
  return (
    <section className={styles.form} aria-label="Рекомендации и решения">
      <h3>Рекомендации и решения</h3>
      {needsRefresh && writable && (
        <Button
          type="button"
          variant="secondary"
          disabled={actions!.busy}
          onClick={() => {
            setError("");
            void actions!
              .mutate(
                patient.id,
                { type: "workflow.refresh" },
                patient.revision,
              )
              .catch((err) => setError(message(err)));
          }}
        >
          Пересверить рекомендации
        </Button>
      )}
      {error && !selection && !execute && <ErrorNotice>{error}</ErrorNotice>}
      {rows.length ? (
        rows.map(card)
      ) : (
        <p className={styles.subtext}>Новых рекомендаций нет.</p>
      )}
      {!!history.length && (
        <details className={styles.details}>
          <summary>История устаревших оснований ({history.length})</summary>
          {history.map(card)}
        </details>
      )}
      {selection && actions && (
        <Modal
          open
          onClose={() => setSelection(null)}
          title="Решение по рекомендации"
        >
          <form className={styles.form} onSubmit={decide}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <p>{selection.r.title}</p>
            <p>{selection.r.rationale}</p>
            {!isCurrent(selection.r) && <p>Основание изменилось</p>}
            <p>Принятие создаёт проект; действие подтверждается отдельно.</p>
            <Select
              label="Предлагаемое действие"
              value={action}
              disabled={selection.decision !== "modify"}
              onChange={(e) => setAction(e.target.value as WorkflowAction)}
            >
              {Object.entries(workflowActionLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
            {["accept", "modify"].includes(selection.decision) && (
              <>
                <Field
                  label="Срок действия / следующего измерения"
                  type="date"
                  value={dueDate}
                  required={action === "scale" || action === "followup"}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                {(action === "consultation" || action === "investigation") && (
                  <Field
                    label="Адресат проекта"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                )}
              </>
            )}
            {["consultation", "investigation"].includes(action) && (
              <Textarea
                label="Причина направления"
                value={projectReason}
                onChange={(e) => setProjectReason(e.target.value)}
                required
              />
            )}
            <Textarea
              label="Причина решения по рекомендации"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={
                selection.decision === "modify" ||
                selection.decision === "reject"
              }
              hint="При стандартном принятии основание переносится автоматически"
            />
            <Button
              type="submit"
              disabled={actions.busy || !isCurrent(selection.r)}
            >
              Сохранить решение
            </Button>
          </form>
        </Modal>
      )}
      {execute && actions && (
        <Modal
          open
          onClose={() => setExecute(null)}
          title="Отдельное подтверждение действия"
        >
          <form className={styles.form} onSubmit={confirm}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <p>{workflowActionLabels[execute.r.action]}</p>
            <p>{execute.r.rationale}</p>
            {!isCurrent(execute.r) && <p>Основание изменилось</p>}
            <p>
              {execute.r.dueDate
                ? `Срок: ${formatDate(execute.r.dueDate)}`
                : "Срок не назначен"}
              {execute.r.destination ? ` · ${execute.r.destination}` : ""}
            </p>
            <p className={styles.subtext}>
              {execute.r.limitations} Назначения лекарств этим действием не
              создаются.
            </p>
            <label className={styles.row}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              Подтверждаю выбранное действие и его основание
            </label>
            <Button
              type="submit"
              disabled={actions.busy || !confirmed || !isCurrent(execute.r)}
            >
              Подтвердить действие
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function WorkflowSafetyBoard({
  patients,
  actions,
}: {
  patients: PatientRecord[];
  actions?: WorkspaceActions;
}) {
  const [selected, setSelected] = useState<{
    p: PatientRecord;
    event: WorkflowSafety;
  } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const rows = patients
    .flatMap((p) => (p.workflow?.safety ?? []).map((event) => ({ p, event })))
    .filter(({ event }) => showHistory || event.status !== "acted")
    .sort(
      (a, b) =>
        (a.event.priority === "urgent" ? 0 : 1) -
        (b.event.priority === "urgent" ? 0 : 1),
    );
  const order: SafetyStage[] = [
    "created",
    "delivered",
    "acknowledged",
    "assessed",
    "acted",
  ];
  const next = selected
    ? order[order.indexOf(selected.event.status) + 1]
    : undefined;
  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!selected || !next || !actions) return;
    try {
      await actions.mutate(
        selected.p.id,
        {
          type: "workflow.safety",
          id: selected.event.id,
          expectedVersion: selected.event.version,
          status: next as Exclude<SafetyStage, "created">,
          note,
        },
        selected.p.revision,
      );
      setSelected(null);
    } catch (err) {
      setError(message(err));
    }
  }
  return (
    <section className={styles.form} aria-label="Риски">
      <div className={styles.between}>
        <h3>Риски</h3>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? "Только в работе" : "Показать историю рисков"}
        </Button>
      </div>
      {!rows.length && <p>Открытых событий нет.</p>}
      {rows.map(({ p, event }) => (
        <article
          key={`${p.id}:${event.id}`}
          className={styles.inlineNote}
          aria-label={`Риски: ${p.profile.name}: ${event.id}`}
        >
          <strong>
            {p.profile.name} ·{" "}
            {event.priority === "urgent"
              ? "Срочно рассмотреть прямое сообщение"
              : "Приоритетно оценить риски"}
          </strong>
          <p>{event.detail}</p>
          <p>
            {safetyStageLabels[event.status]} ·{" "}
            {event.evaluation === "not-assessed"
              ? "Клиническая оценка не выполнена"
              : "Оценка зафиксирована врачом"}
          </p>
          {event.assessment && <p>Оценка: {event.assessment}</p>}
          {event.action && <p>Действие: {event.action}</p>}
          <details className={styles.details}>
            <summary>Источник и этапы оценки рисков</summary>
            <p>
              Оценка {event.assessmentId} ·{" "}
              {p.workflow?.assessments.find(
                (assessment) => assessment.id === event.assessmentId,
              )?.protocolVersion ?? "Версия неизвестна"}
            </p>
            {event.history.map((h, i) => (
              <p key={i}>
                {formatDate(h.at)} · {h.by.name} · {safetyStageLabels[h.status]}{" "}
                · {h.note}
              </p>
            ))}
          </details>
          {actions && !p.archived && event.status !== "acted" && (
            <Button
              type="button"
              variant="secondary"
              disabled={actions.busy}
              onClick={() => {
                setSelected({ p, event });
                setNote(
                  event.status === "created"
                    ? "Врач подтвердил получение в локальной очереди"
                    : event.status === "delivered"
                      ? "Врач принял событие в работу"
                      : "",
                );
                setError("");
              }}
            >
              {safetyStageLabels[order[order.indexOf(event.status) + 1]!]}
            </Button>
          )}
        </article>
      ))}
      {selected && actions && next && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title="Этап оценки рисков"
        >
          <form className={styles.form} onSubmit={submit}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <p>
              {selected.p.profile.name} · {selected.event.detail}
            </p>
            <p>Следующий этап: {safetyStageLabels[next]}</p>
            <Textarea
              label="Оценка / действие / основание этапа"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
            />
            <Button type="submit" disabled={actions.busy}>
              Подтвердить этап оценки рисков
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function WorkflowPanel({
  patient,
  actions,
  compact = false,
  visitId,
}: {
  patient: PatientRecord;
  actions?: WorkspaceActions;
  compact?: boolean;
  visitId?: string;
}) {
  const [submission, setSubmission] = useState(false);
  const [scenario, setScenario] = useState("complete");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const assessments = (patient.workflow?.assessments ?? [])
    .slice()
    .reverse()
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
  const latestVersions = new Set<string>();
  const latestAssessments = assessments.filter((assessment) => {
    if (latestVersions.has(assessment.protocolVersion)) return false;
    latestVersions.add(assessment.protocolVersion);
    return true;
  });
  const historicalAssessments = assessments.filter(
    (assessment) => !latestAssessments.includes(assessment),
  );
  const writable = !!actions && !patient.archived;
  async function loadScenario() {
    if (!actions) return;
    setLoading(true);
    setError("");
    try {
      let current = patient;
      for (const mutation of scenarioMutations(scenario))
        current = await actions.mutate(patient.id, mutation, current.revision);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  function form() {
    setSubmission(true);
  }
  function renderAssessments(items: typeof assessments) {
    return (
      <>
        {" "}
        {items.map((a) => {
          const compare = workflowComparison(patient, a.id);
          return (
            <article
              className={styles.inlineNote}
              key={a.id}
              aria-label={`Оценка пациента: ${a.id}`}
            >
              <strong>
                {a.source.title} ·{" "}
                {a.completeness === "complete"
                  ? "Завершена"
                  : a.completeness === "partial"
                    ? "Есть пропуски"
                    : a.completeness === "declined"
                      ? "Отказ"
                      : "Не смог заполнить"}
              </strong>
              <p>
                {formatDate(a.measuredAt)} · {a.source.window}
              </p>
              <p>
                {a.score === null
                  ? "Итог не рассчитан: нет полных ответов"
                  : `Результат: ${a.score} из ${a.source.status === "synthetic-only" ? a.source.items * 3 : a.source.maximum}`}
              </p>
              {a.completeness === "complete" && a.interpretation && (
                <p>{a.interpretation.label}</p>
              )}
              <p>{a.note}</p>
              <p className={styles.subtext}>
                Со слов пациента · получено {formatDate(a.receivedAt)} ·{" "}
                {a.receivedBy.name}
              </p>
              <details className={styles.details}>
                <summary>Ответы, источник и сопоставимая динамика</summary>
                <ol>
                  {a.answers.map((value, index) => (
                    <li key={index}>
                      {a.source.questions?.[index] ?? `Пункт ${index + 1}`}:{" "}
                      {value === null
                        ? "Пропуск / неизвестно"
                        : (a.source.options?.[value] ?? value)}
                    </li>
                  ))}
                </ol>
                {a.source.impactQuestion && (
                  <p>
                    {a.source.impactQuestion}{" "}
                    {a.impact == null
                      ? "Ответ не получен / не требовался"
                      : (a.source.impactOptions?.[a.impact] ?? a.impact)}
                  </p>
                )}
                <p>
                  {a.source.source} · {a.protocolVersion} · {a.source.status}
                </p>
                <p>Клиническое утверждение отсутствует.</p>
                {a.source.attribution && <p>{a.source.attribution}</p>}
                {a.source.sourceUrl && (
                  <p>
                    <a
                      href={a.source.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Бланк источника
                    </a>
                  </p>
                )}
                {a.interpretation && (
                  <p>
                    <a
                      href={a.interpretation.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Источник описания симптомов
                    </a>{" "}
                    · Диагноз не устанавливается по сумме.
                  </p>
                )}
                <p>
                  Исходный сопоставимый результат:{" "}
                  {compare.baseline?.score ?? "нет"}; предыдущий:{" "}
                  {compare.previous?.score ?? "нет"}; изменение суммы:{" "}
                  {compare.delta === null
                    ? "не вычислено"
                    : compare.delta > 0
                      ? `+${compare.delta}`
                      : compare.delta}
                </p>
                {compare.answerChanges.map((v) => (
                  <p key={v.item}>
                    Пункт {v.item}: {v.previous ?? "пропуск"} →{" "}
                    {v.current ?? "пропуск"}
                  </p>
                ))}
                <p>
                  Отсутствие прямого сообщения о рисках не является заключением
                  об отсутствии риска.
                </p>
              </details>
            </article>
          );
        })}
      </>
    );
  }
  return (
    <section
      className={styles.form}
      aria-label="Результаты тестов и рекомендации"
    >
      <WorkflowChanges patient={patient} />
      <details className={styles.details} open={!compact}>
        <summary>Результаты тестов и рекомендации</summary>
        <div className={styles.form}>
          {error && !submission && <ErrorNotice>{error}</ErrorNotice>}
          {writable && (
            <details className={styles.details}>
              <summary>Добавить данные</summary>
              <div className={styles.form}>
                <Select
                  label="Сценарий"
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                >
                  {clinicalScenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
                <div className={styles.row}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void loadScenario()}
                    disabled={loading || actions!.busy}
                  >
                    {loading ? "Загрузка сценария…" : "Добавить сценарий"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={form}
                    disabled={loading || actions!.busy}
                  >
                    Добавить самоотчёт
                  </Button>
                </div>
              </div>
            </details>
          )}
          <h3>Новые оценки пациента</h3>
          {!assessments.length && <p>Результаты ещё не поступали.</p>}
          {renderAssessments(latestAssessments)}
          {historicalAssessments.length > 0 && (
            <details className={styles.details}>
              <summary>
                Предыдущие оценки ({historicalAssessments.length})
              </summary>
              {renderAssessments(historicalAssessments)}
            </details>
          )}
          <WorkflowRecommendations patient={patient} actions={actions} />
          {!!patient.workflow?.assignments.length && (
            <section aria-label="Задания на самоопросники">
              <h3>Задания на самоопросники</h3>
              {patient.workflow.assignments.map((a) => (
                <div key={a.id}>
                  <p>
                    Самоопросник · до {formatDate(a.dueDate)} ·{" "}
                    {a.status === "issued" ? "Выдано" : "Ответ получен"}
                  </p>
                  <details className={styles.details}>
                    <summary>Источник и выдача задания</summary>
                    <p>
                      {a.protocolVersion} · {a.issuedBy.name} · {a.id}
                    </p>
                    <p>
                      {getClinicalProtocol(a.protocolVersion)?.status ??
                        "synthetic-only"}{" "}
                      · Клиническое утверждение отсутствует.
                    </p>
                  </details>
                </div>
              ))}
            </section>
          )}
          <WorkflowSafetyBoard patients={[patient]} actions={actions} />
        </div>
      </details>
      {submission && actions && (
        <ClinicalQuestionnaire
          patient={patient}
          actions={actions}
          visitId={visitId}
          onClose={() => setSubmission(false)}
        />
      )}
    </section>
  );
}
