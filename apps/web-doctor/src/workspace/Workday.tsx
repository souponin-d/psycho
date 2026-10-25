import { useState } from "react";
import type { PatientRecord, Visit } from "./model";
import type { Navigate } from "./PatientDirectory";
import {
  formatDate,
  formatTime,
  initials,
  localDateTime,
  today,
  visitStatus,
} from "./labels";
import {
  Badge,
  Button,
  Empty,
  Field,
  Icon,
  Section,
  styles,
} from "./ui/Elements";
export function AppointmentRow({
  patient,
  visit,
  navigate,
}: {
  patient: PatientRecord;
  visit: Visit;
  navigate: Navigate;
}) {
  return (
    <div className={styles.scheduleRow}>
      <div className={styles.time}>
        <small>
          {formatDate(visit.scheduledAt, { day: "numeric", month: "short" })}
        </small>
        {formatTime(visit.scheduledAt)}
        <small>{visit.durationMinutes} мин</small>
      </div>
      <div className={styles.avatar}>{initials(patient.profile.name)}</div>
      <div>
        <button
          className={styles.textButton}
          onClick={() => navigate(`/patients/${patient.id}`)}
        >
          {patient.profile.name}
        </button>
        <div className={styles.subtext}>
          {visit.kind === "initial"
            ? "Первичный"
            : visit.kind === "follow-up"
              ? "Повторный"
              : "Внеплановый"}{" "}
          · {visit.format === "remote" ? "Дистанционно" : "Очно"}
        </div>
      </div>
      <Button
        variant={visit.status === "in-progress" ? "primary" : "secondary"}
        onClick={() => navigate(`/patients/${patient.id}/visits/${visit.id}`)}
      >
        {visit.status === "in-progress"
          ? "Продолжить"
          : visit.status === "completed"
            ? "Итог приёма"
            : visit.status === "cancelled"
              ? "Отменён"
              : "Открыть приём"}
      </Button>
    </div>
  );
}
export function Workday({
  patients,
  navigate,
  onCreate,
}: {
  patients: PatientRecord[];
  navigate: Navigate;
  onCreate: () => void;
}) {
  const visible = patients.filter((p) => !p.archived);
  const appointments = visible
    .flatMap((patient) =>
      patient.visits
        .filter(
          (v) =>
            localDateTime(v.scheduledAt).startsWith(today()) &&
            v.status !== "cancelled",
        )
        .map((visit) => ({ patient, visit })),
    )
    .sort((a, b) => a.visit.scheduledAt.localeCompare(b.visit.scheduledAt));
  const events = visible
    .flatMap((patient) =>
      patient.events
        .filter((e) => e.status !== "closed")
        .map((event) => ({ patient, event })),
    )
    .sort(
      (a, b) =>
        ({ urgent: 0, important: 1, routine: 2 })[a.event.urgency] -
          { urgent: 0, important: 1, routine: 2 }[b.event.urgency] ||
        (a.event.dueAt || "9999").localeCompare(b.event.dueAt || "9999"),
    );
  const first = events[0];
  const unread = visible.reduce(
    (n, p) => n + p.reports.filter((r) => !r.reviewedAt).length,
    0,
  );
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>Ваш рабочий день</h1>
          <p>
            {formatDate(new Date().toISOString(), {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <Button icon="plus" onClick={onCreate}>
          Новый пациент
        </Button>
      </div>
      <div className={styles.compactMetrics}>
        <span>
          <strong>{appointments.length}</strong> приёма сегодня
        </span>
        <span>
          <strong>
            {appointments.filter((a) => a.visit.status === "completed").length}
          </strong>{" "}
          завершено
        </span>
        <span>
          <strong>{unread}</strong> новых записей
        </span>
      </div>
      {first ? (
        <section
          className={styles.attentionBanner}
          aria-label="Требуют внимания"
        >
          <span className={styles.attentionSignal}>
            <Icon name="bell" size={19} />
          </span>
          <Badge tone={first.event.urgency === "urgent" ? "red" : "amber"}>
            {first.event.urgency === "urgent"
              ? "Срочно"
              : first.event.urgency === "important"
                ? "Требует оценки"
                : "Планово"}
          </Badge>
          <div>
            <strong>{first.event.title}</strong>
            <p>
              {first.patient.profile.name}
              {first.event.dueAt
                ? ` · срок ${formatDate(first.event.dueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : " · срок не указан"}
              {events.length > 1 ? ` · ещё событий: ${events.length - 1}` : ""}
            </p>
          </div>
          <Button
            variant="secondary"
            icon="arrow"
            onClick={() => navigate("/events")}
          >
            Разобрать · {events.length}
          </Button>
        </section>
      ) : (
        <div className={styles.workspaceLine}>Открытых событий нет</div>
      )}
      <div className={styles.workdayColumns}>
        <Section
          title="Приёмы на сегодня"
          description="Откройте карту или перейдите к встрече"
          action={
            <Button
              variant="ghost"
              icon="calendar"
              onClick={() => navigate("/calendar")}
            >
              Календарь
            </Button>
          }
        >
          {appointments.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.workdaySchedule}>
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Пациент</th>
                    <th>Встреча</th>
                    <th>
                      <span className={styles.stepHeading}>Действие</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a, i) => (
                    <tr key={a.visit.id}>
                      <td>
                        <strong>{formatTime(a.visit.scheduledAt)}</strong>
                        <p className={styles.subtext}>
                          {a.visit.durationMinutes} мин
                        </p>
                      </td>
                      <td>
                        <div className={styles.schedulePatient}>
                          <span className={styles.avatar}>
                            {initials(a.patient.profile.name)}
                          </span>
                          <div>
                            <button
                              className={styles.textButton}
                              onClick={() =>
                                navigate(`/patients/${a.patient.id}`)
                              }
                            >
                              {a.patient.profile.name}
                            </button>
                            <p className={styles.subtext}>
                              {a.visit.kind === "initial"
                                ? "Первичный"
                                : a.visit.kind === "follow-up"
                                  ? "Повторный"
                                  : "Внеплановый"}{" "}
                              ·{" "}
                              {a.visit.format === "remote"
                                ? "Дистанционно"
                                : "Очно"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={styles.scheduleStatus}>
                        <Badge>{visitStatus[a.visit.status]}</Badge>
                      </td>
                      <td>
                        <Button
                          variant={
                            a.visit.status === "in-progress" ||
                            (i === 0 && a.visit.status === "scheduled")
                              ? "primary"
                              : "secondary"
                          }
                          icon="arrow"
                          onClick={() =>
                            navigate(
                              `/patients/${a.patient.id}/visits/${a.visit.id}`,
                            )
                          }
                        >
                          {a.visit.status === "in-progress"
                            ? "Продолжить"
                            : a.visit.status === "completed"
                              ? "Итог приёма"
                              : "Открыть приём"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon="calendar"
              title="Сегодня свободно"
              action={
                <Button
                  variant="secondary"
                  onClick={() => navigate("/patients")}
                >
                  Выбрать пациента
                </Button>
              }
            >
              Запланируйте встречу в карте пациента.
            </Empty>
          )}
        </Section>
        <Section
          title="После последнего контакта"
          description="Последние записи в картах пациентов"
        >
          {visible
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 4)
            .map((p) => {
              const report = p.reports
                .slice()
                .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0];
              return (
                <div
                  className={`${styles.inlineNote} ${styles.activityEntry}`}
                  key={p.id}
                >
                  <Icon name={report ? "message" : "file"} size={17} />
                  <div>
                    <button
                      className={styles.textButton}
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      {p.profile.name}
                    </button>
                    <p>{report?.note || "Текстовых записей пока нет"}</p>
                    <p className={styles.subtext}>
                      {report
                        ? `Самоотчёт · ${formatDate(report.reportedAt)}`
                        : "Из карты пациента"}
                    </p>
                  </div>
                </div>
              );
            })}
          {!visible.length && (
            <Empty title="Карт пока нет" icon="people">
              Добавьте учебного пациента или доступную вам карту.
            </Empty>
          )}
        </Section>
      </div>
    </>
  );
}
export function Calendar({
  patients,
  navigate,
}: {
  patients: PatientRecord[];
  navigate: Navigate;
}) {
  const [from, setFrom] = useState(today());
  const [status, setStatus] = useState("all");
  const appointments = patients
    .filter((p) => !p.archived)
    .flatMap((patient) =>
      patient.visits
        .filter(
          (v) =>
            localDateTime(v.scheduledAt).slice(0, 10) >= from &&
            (status === "all" || v.status === status),
        )
        .map((visit) => ({ patient, visit })),
    )
    .sort((a, b) => a.visit.scheduledAt.localeCompare(b.visit.scheduledAt));
  const days = [
    ...new Set(
      appointments.map((a) => localDateTime(a.visit.scheduledAt).slice(0, 10)),
    ),
  ];
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>Календарь приёмов</h1>
          <p>
            Время показано в вашем часовом поясе:{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
        </div>
        <Button
          variant="secondary"
          icon="people"
          onClick={() => navigate("/patients")}
        >
          Запланировать из карты
        </Button>
      </div>
      <Section title="Ближайшие встречи">
        <div className={styles.toolbar}>
          <Field
            label="Начиная с даты"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <div className={styles.segmented}>
            {[
              ["all", "Все"],
              ["scheduled", "Запланированные"],
              ["completed", "Завершённые"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={status === key}
                onClick={() => setStatus(key!)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {days.map((day) => (
          <div className={styles.calendarDay} key={day}>
            <div className={styles.calendarDate}>
              <strong>
                {formatDate(`${day}T12:00:00`, { day: "numeric" })}
              </strong>
              <span>
                {formatDate(`${day}T12:00:00`, {
                  month: "short",
                  weekday: "short",
                })}
              </span>
            </div>
            <div>
              {appointments
                .filter((a) =>
                  localDateTime(a.visit.scheduledAt).startsWith(day),
                )
                .map((a) => (
                  <div key={a.visit.id}>
                    <AppointmentRow {...a} navigate={navigate} />
                    {a.visit.status === "cancelled" && (
                      <Badge>{visitStatus[a.visit.status]}</Badge>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
        {!days.length && (
          <Empty icon="calendar" title="Приёмов на этот период нет">
            Измените дату или создайте встречу в карте пациента.
          </Empty>
        )}
      </Section>
    </>
  );
}
