import type { PatientRecord } from "./model";
import type { Navigate } from "./PatientDirectory";
import { formatDate } from "./labels";
import { Badge, Button, styles } from "./ui/Elements";

export function PatientBrief({
  patient,
  navigate,
  visitId,
  compact = false,
}: {
  patient: PatientRecord;
  navigate: Navigate;
  visitId?: string;
  compact?: boolean;
}) {
  const previous = patient.visits
    .filter((v) => v.status === "completed" && v.id !== visitId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const report = patient.reports
    .slice()
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0];
  const plan = patient.plan.filter((p) => p.status === "confirmed");
  return (
    <section
      className={`${styles.patientBrief} ${compact ? styles.briefCompact : ""}`}
      aria-label="Сводка перед приёмом"
    >
      <div className={styles.between}>
        <h2>
          {compact
            ? "Перед решением"
            : previous
              ? "К повторному приёму"
              : "К приёму"}
        </h2>
        <Badge>Из карты</Badge>
      </div>
      <div className={styles.briefColumns}>
        <div>
          <h3>Последний самоотчёт</h3>
          {report ? (
            <>
              <p className={styles.quote}>
                {report.note || "Текстового комментария нет"}
              </p>
              <p className={styles.subtext}>
                {
                  {
                    patient: "Со слов пациента",
                    clinician: "Оценка врача",
                    relative: "Со слов близкого",
                    document: "Из документа",
                  }[report.provenance]
                }{" "}
                · {formatDate(report.reportedAt)}
              </p>
              {!compact && (
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/patients/${patient.id}/journal`)}
                >
                  Открыть запись
                </Button>
              )}
            </>
          ) : (
            <p className={styles.subtext}>Самоотчётов пока нет</p>
          )}
        </div>
        <div>
          <h3>Действующий план</h3>
          {plan.length ? (
            plan.slice(0, 3).map((p) => (
              <div className={styles.briefPlan} key={p.id}>
                <strong>{p.title}</strong>
                {p.dueDate && (
                  <p className={styles.subtext}>
                    Контроль {formatDate(p.dueDate)}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className={styles.subtext}>Подтверждённых решений пока нет</p>
          )}
          <p className={styles.subtext}>
            {patient.plan.some(
              (p) => p.kind === "medication" && p.status === "confirmed",
            )
              ? "Назначения доступны в разделе лечения"
              : "Действующих лекарственных назначений нет"}
          </p>
          {!compact && (
            <Button
              variant="ghost"
              onClick={() => navigate(`/patients/${patient.id}/plan`)}
            >
              Открыть лечение и план
            </Button>
          )}
        </div>
      </div>
      {compact && previous && (
        <div className={styles.briefPrevious}>
          <p className={styles.subtext}>
            Предыдущий приём · {formatDate(previous.completedAt)}
          </p>
          <p>{previous.notes.conclusion || "Заключение не внесено"}</p>
          <Button
            variant="ghost"
            onClick={() =>
              navigate(`/patients/${patient.id}/visits/${previous.id}`)
            }
          >
            Открыть прошлую запись
          </Button>
        </div>
      )}
    </section>
  );
}
