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
import { Badge, Button, Empty, Field, Section, styles } from "./ui/Elements";
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
  const appointments = patients
    .filter((p) => !p.archived)
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
  const events = patients
    .filter((p) => !p.archived)
    .flatMap((patient) =>
      patient.events
        .filter((e) => e.status !== "closed")
        .map((event) => ({ patient, event })),
    )
    .sort(
      (a, b) =>
        ({ urgent: 0, important: 1, routine: 2 })[a.event.urgency] -
        { urgent: 0, important: 1, routine: 2 }[b.event.urgency],
    );
  const unread = patients.reduce(
    (n, p) => n + p.reports.filter((r) => !r.reviewedAt).length,
    0,
  );
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>
            {formatDate(new Date().toISOString(), {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <h1>Ваш рабочий день</h1>
          <p>Главное о пациентах, с которыми вы работаете сегодня</p>
        </div>
        <Button icon="plus" onClick={onCreate}>
          Новый пациент
        </Button>
      </div>
      <div className={styles.summaryStrip}>
        <div className={styles.summaryCell}>
          <span>Приёмы сегодня</span>
          <strong>{appointments.length}</strong>
          <small>
            {appointments.filter((a) => a.visit.status === "completed").length}{" "}
            завершено
          </small>
        </div>
        <div className={styles.summaryCell}>
          <span>Требуют внимания</span>
          <strong>{events.length}</strong>
          <small>событий в работе</small>
        </div>
        <div className={styles.summaryCell}>
          <span>Новые записи</span>
          <strong>{unread}</strong>
          <small>в дневниках пациентов</small>
        </div>
      </div>
      <div className={styles.dashboardGrid}>
        <div className={styles.stack}>
          <Section
            title="Расписание на сегодня"
            description="Начните приём или вернитесь к сохранённому черновику"
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
              appointments.map((a) => (
                <AppointmentRow key={a.visit.id} {...a} navigate={navigate} />
              ))
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
                Запланируйте встречу в карте пациента. Здесь появятся время и
                быстрый переход к приёму.
              </Empty>
            )}
          </Section>
          <Section
            title="Последние обновления"
            description="Записи и изменения в картах пациентов"
          >
            {patients
              .filter((p) => !p.archived)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 4)
              .map((p) => (
                <div className={styles.inlineNote} key={p.id}>
                  <div className={styles.between}>
                    <button
                      className={styles.textButton}
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      {p.profile.name}
                    </button>
                    <span className={styles.subtext}>
                      {formatDate(p.updatedAt, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p>
                    {p.reports.at(-1)?.note ||
                      p.episodes.at(-1)?.title ||
                      "Новая карта пациента"}
                  </p>
                </div>
              ))}
          </Section>
        </div>
        <div className={styles.stack}>
          <Section
            title="В поле внимания"
            action={
              <Badge tone={events.length ? "amber" : "neutral"}>
                {events.length}
              </Badge>
            }
          >
            {events.length ? (
              events.slice(0, 5).map(({ patient, event }) => (
                <article className={styles.eventCard} key={event.id}>
                  <div className={styles.between}>
                    <Badge tone={event.urgency === "urgent" ? "red" : "amber"}>
                      {event.urgency === "urgent"
                        ? "Срочно"
                        : event.urgency === "important"
                          ? "Требует оценки"
                          : "Планово"}
                    </Badge>
                    <span className={styles.subtext}>
                      {formatDate(event.createdAt, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <h3 style={{ marginTop: 10 }}>{event.title}</h3>
                  <p>
                    {patient.profile.name} · {event.detail}
                  </p>
                  <Button
                    variant="ghost"
                    icon="arrow"
                    onClick={() => navigate(`/patients/${patient.id}/events`)}
                  >
                    Перейти к событию
                  </Button>
                </article>
              ))
            ) : (
              <Empty icon="check" title="Всё просмотрено">
                Новые события появятся здесь вместе с основанием и временем
                поступления.
              </Empty>
            )}
          </Section>
          <div className={styles.notice}>
            <strong>Контекст перед решением</strong>
            <br />В приёме доступны история наблюдения, результаты шкал, дневник
            и источники. Неполные сведения остаются видимыми.
          </div>
        </div>
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
