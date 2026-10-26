import type { PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import type { Navigate } from "./PatientDirectory";
import { WorkflowRecommendations } from "./ClinicalWorkflow";
import { isSupportEvaluationCurrent } from "./clinical-support";
import {
  workflowActionLabels,
  workflowStatusLabels,
  isWorkflowRecommendationCurrent,
} from "./clinical-workflow";
import { Button, styles } from "./ui/Elements";
export function ClinicalDecisionQueue({
  patients,
  actions,
  navigate,
}: {
  patients: PatientRecord[];
  actions?: WorkspaceActions;
  navigate: Navigate;
}) {
  const rows = patients
    .filter((p) => !p.archived)
    .flatMap((p) =>
      (p.workflow?.recommendations ?? [])
        .filter(
          (r) => !r.stale && !["fulfilled", "rejected"].includes(r.status),
        )
        .map((r) => ({ p, r })),
    )
    .sort(
      (a, b) =>
        ({ urgent: 0, important: 1, routine: 2 })[a.r.priority] -
          { urgent: 0, important: 1, routine: 2 }[b.r.priority] ||
        a.r.createdAt.localeCompare(b.r.createdAt),
    );
  const supportRows = patients
    .filter((p) => !p.archived)
    .flatMap((p) => {
      const e = p.clinicalSupport?.evaluations.at(-1);
      if (!e) return [];
      const pending = e.result.options.filter(
        (o) =>
          o.status !== "defer" &&
          !p.clinicalSupport?.decisions.some(
            (d) => d.evaluationId === e.id && d.optionId === o.id,
          ),
      );
      return pending.length ? [{ p, e, pending }] : [];
    });
  const safety = patients
    .filter((p) => !p.archived)
    .flatMap((p) =>
      (p.workflow?.safety ?? [])
        .filter((e) => e.status !== "acted")
        .map((e) => ({ p, e })),
    );
  return (
    <section className={styles.form} aria-label="Очередь решений врача">
      <div className={styles.between}>
        <h2>Очередь решений врача</h2>
        <span>{rows.length + supportRows.length} к рассмотрению</span>
      </div>
      {!!safety.length && (
        <div className={styles.inlineNote}>
          <strong>Риски: {safety.length}</strong>

          <Button variant="secondary" onClick={() => navigate("/events")}>
            Открыть риски
          </Button>
        </div>
      )}
      {!rows.length && !supportRows.length && (
        <p className={styles.subtext}>Новых рекомендаций нет.</p>
      )}
      {supportRows.map(({ p, e, pending }) => (
        <div className={styles.inlineNote} key={`support-${p.id}`}>
          <strong>{p.profile.name} · Обсудить варианты помощи</strong>
          <p>
            {e.input.route === "gad"
              ? "Тревожные симптомы"
              : "Депрессивные симптомы"}{" "}
            · {pending.length} вариантов
            {actions &&
              !isSupportEvaluationCurrent(p, e, actions.actor) &&
              " · Обновить оценку"}
          </p>
          <Button
            variant="secondary"
            onClick={() => navigate(`/patients/${p.id}`)}
          >
            Открыть клиническую оценку
          </Button>
        </div>
      ))}
      {rows.map(({ p, r }) => (
        <details className={styles.details} key={`${p.id}:${r.id}`}>
          <summary>
            {p.profile.name} · {workflowActionLabels[r.action]} ·{" "}
            {r.priority === "important"
              ? "приоритетно"
              : r.priority === "urgent"
                ? "срочно"
                : "планово"}{" "}
            · {r.dueDate || "срок не назначен"} ·{" "}
            {workflowStatusLabels[r.status]}
            {!isWorkflowRecommendationCurrent(p, r, actions?.actor) &&
              " · Основание изменилось"}
            {r.referralCategory &&
              ` · ${r.referralCategory === "required" ? "Обязательно" : "Желательно"}`}
          </summary>
          <div className={styles.form}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(`/patients/${p.id}`)}
            >
              Открыть карту пациента
            </Button>
            <WorkflowRecommendations
              patient={p}
              actions={actions}
              onlyId={r.id}
            />
          </div>
        </details>
      ))}
    </section>
  );
}
