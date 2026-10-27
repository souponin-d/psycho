import type { PatientRecord } from "./model";
import type { Navigate } from "./PatientDirectory";
import { formatDate } from "./labels";
import { Button, Section, styles } from "./ui/Elements";

type Incoming = {
  key: string;
  name: string;
  at: string;
  kind: string;
  detail: string;
  path: string;
  isNew?: boolean;
};

export function patientIncoming(patients: PatientRecord[]): Incoming[] {
  return patients
    .filter((p) => !p.archived)
    .flatMap((p) => {
      const route = `/patients/${p.id}`;
      const base = { name: p.profile.name };
      const messages: Incoming[] = p.messages
        .filter((m) => m.direction === "patient")
        .map((m) => ({
          ...base,
          key: `${p.id}:message:${m.id}`,
          at: m.createdAt,
          kind: "Сообщение",
          detail: m.text,
          path: `${route}/messages`,
        }));
      const reports: Incoming[] = p.reports
        .filter((r) => r.provenance === "patient")
        .map((r) => ({
          ...base,
          key: `${p.id}:report:${r.id}`,
          at: r.receivedAt || r.createdAt,
          kind: "Самоотчёт",
          detail: r.note || r.mobile?.label || "Запись пациента",
          path: `${route}/journal`,
          isNew: !r.reviewedAt,
        }));
      const assessments: Incoming[] = (p.workflow?.assessments ?? [])
        .filter(
          (a) =>
            (a.receivedBy as { specialty: string }).specialty === "patient",
        )
        .map((a) => ({
          ...base,
          key: `${p.id}:assessment:${a.id}`,
          at: a.receivedAt,
          kind: "Результат опроса",
          detail: a.source.title,
          path: `${route}/overview`,
        }));
      const doses: Incoming[] = (p.adherence?.records ?? []).flatMap((record) =>
        record.history
          .filter(
            (revision) =>
              (revision.by as { specialty: string }).specialty === "patient",
          )
          .map((revision) => ({
            ...base,
            key: `${p.id}:dose:${record.id}:${revision.version}`,
            at: revision.at,
            kind: "Отметка о приёме",
            detail: `${p.adherence?.schedules.find((schedule) => schedule.id === record.scheduleId && schedule.version === record.scheduleVersion)?.planSnapshot.title ?? "Назначение"} · ${formatDate(record.plannedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${revision.version < record.version ? "Предыдущая отметка: " : ""}${
              {
                taken: "Принял",
                missed: "Пропустил",
                "not-applicable": "Не применимо",
                unknown: "Нет отметки",
              }[revision.status]
            }`,
            path: `${route}/plan`,
          })),
      );
      return [...messages, ...reports, ...assessments, ...doses];
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}

export function PatientIncoming({
  patients,
  navigate,
}: {
  patients: PatientRecord[];
  navigate: Navigate;
}) {
  const rows = patientIncoming(patients);
  return (
    <Section title="От пациентов">
      {rows.length === 0 ? (
        <p className={styles.subtext}>Новых данных пока нет.</p>
      ) : (
        <div className={styles.stack}>
          {rows.map((row) => (
            <article className={styles.inlineNote} key={row.key}>
              <div className={styles.between}>
                <strong>
                  {row.name} · {row.kind}
                  {row.isNew ? " · Новое" : ""}
                </strong>
                <Button variant="secondary" onClick={() => navigate(row.path)}>
                  Открыть
                </Button>
              </div>
              <p>{row.detail}</p>
              <p className={styles.subtext}>
                {formatDate(row.at, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
