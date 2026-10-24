import { useState, type FormEvent } from "react";
import type { CareEvent, EventStatus, PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import type { Navigate } from "./PatientDirectory";
import { message } from "./useWorkspace";
import { eventStatus, formatDate, localDateTime, today } from "./labels";
import { SourceLinks } from "./SourceLibrary";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Modal,
  Section,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";
export function Events({
  patients,
  actions,
  navigate,
  patient,
}: {
  patients: PatientRecord[];
  actions: WorkspaceActions;
  navigate: Navigate;
  patient?: PatientRecord;
}) {
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState<{
    patientId: string;
    eventId: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [add, setAdd] = useState(false);
  const allRows = (patient ? [patient] : patients.filter((p) => !p.archived))
    .flatMap((p) => p.events.map((event) => ({ patient: p, event })))
    .sort(
      (a, b) =>
        ({ urgent: 0, important: 1, routine: 2 })[a.event.urgency] -
          { urgent: 0, important: 1, routine: 2 }[b.event.urgency] ||
        a.event.createdAt.localeCompare(b.event.createdAt),
    );
  const matches = (e: CareEvent, kind: string) =>
    kind === "all" ||
    (e.status !== "closed" &&
      (kind === "open" ||
        (kind === "urgent" && e.urgency === "urgent") ||
        (kind === "overdue" && !!e.dueAt && Date.parse(e.dueAt) < Date.now()) ||
        (kind === "today" &&
          !!e.dueAt &&
          localDateTime(e.dueAt).slice(0, 10) === today())));
  const rows = allRows.filter(({ event }) => matches(event, filter));
  const record = selected
    ? patients.find((p) => p.id === selected.patientId)
    : undefined;
  const event = record?.events.find((e) => e.id === selected?.eventId);
  const nextStatus = event
    ? (
        {
          created: "acknowledged",
          acknowledged: "assessed",
          assessed: "acted",
          acted: "closed",
          closed: "closed",
        } as const
      )[event.status]
    : "acknowledged";
  async function advance(e: FormEvent) {
    e.preventDefault();
    if (!record || !event) return;
    try {
      await actions.mutate(record.id, {
        type: "event.transition",
        id: event.id,
        status: nextStatus,
        note,
      });
      setNote("");
      setSelected(null);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <>
      {!patient && (
        <div className={styles.pageHeading}>
          <div>
            <h1>Внимание и контроль</h1>
            <p>Что требует решения врача и к какому сроку</p>
          </div>
        </div>
      )}
      <Section
        title={patient ? "События пациента" : "Очередь врача"}
        action={
          patient ? (
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => setAdd(true)}
            >
              Добавить событие
            </Button>
          ) : undefined
        }
      >
        <div
          className={`${styles.segmented} ${styles.eventFilters}`}
          role="group"
          aria-label="Фильтр событий"
        >
          {[
            ["open", "В работе"],
            ["urgent", "Срочно"],
            ["overdue", "Просрочено"],
            ["today", "Сегодня"],
            ["all", "Все"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id!)}
            >
              {label} ·{" "}
              {allRows.filter(({ event }) => matches(event, id!)).length}
            </button>
          ))}
        </div>
        <p className={styles.subtext}>
          Срок задачи и клиническая срочность показаны отдельно. Просрочка не
          меняет оценку риска.
        </p>
        {rows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.eventQueue}>
              <thead>
                <tr>
                  <th>Пациент</th>
                  <th>Вопрос и следующий шаг</th>
                  <th>Срок и ответственный</th>
                  <th>
                    <span className={styles.stepHeading}>Действие</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ patient: p, event: e }) => (
                  <tr key={`${p.id}-${e.id}`}>
                    <td>
                      <button
                        className={styles.textButton}
                        onClick={() => navigate(`/patients/${p.id}`)}
                      >
                        {p.profile.name}
                      </button>
                      <p className={styles.subtext}>{p.code}</p>
                    </td>
                    <td>
                      <div className={styles.row}>
                        <Badge
                          tone={
                            e.urgency === "urgent"
                              ? "red"
                              : e.urgency === "important"
                                ? "amber"
                                : "neutral"
                          }
                        >
                          {
                            {
                              urgent: "Срочно",
                              important: "Требует оценки",
                              routine: "Планово",
                            }[e.urgency]
                          }
                        </Badge>
                        <Badge>{eventStatus[e.status]}</Badge>
                      </div>
                      <h3>{e.title}</h3>
                      <p>{e.detail}</p>
                      <p className={styles.subtext}>
                        Создано{" "}
                        {formatDate(e.createdAt, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <SourceLinks ids={e.sourceIds} />
                    </td>
                    <td>
                      <p>
                        {e.dueAt
                          ? formatDate(e.dueAt, {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Срок не указан"}
                      </p>
                      {e.status !== "closed" &&
                        e.dueAt &&
                        Date.parse(e.dueAt) < Date.now() && (
                          <p className={styles.overdue}>Срок прошёл</p>
                        )}
                      <p className={styles.subtext}>
                        {e.assignee || "Ответственный не указан"}
                      </p>
                    </td>
                    <td>
                      <Button
                        variant={
                          e.status === "closed" ? "secondary" : "primary"
                        }
                        onClick={() => {
                          setSelected({ patientId: p.id, eventId: e.id });
                          setNote("");
                          setError("");
                        }}
                      >
                        {e.status === "closed"
                          ? "История обработки"
                          : "Разобрать событие"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!rows.length && (
          <Empty
            icon="check"
            title={
              filter === "urgent"
                ? "Срочных событий нет"
                : filter === "overdue"
                  ? "Просроченных событий нет"
                  : filter === "today"
                    ? "Событий на сегодня нет"
                    : filter === "all"
                      ? "История событий пуста"
                      : "Открытых событий нет"
            }
          >
            Новые сообщения о переносимости и явно отмеченные вопросы
            безопасности появятся здесь. Событие можно создать вручную.
          </Empty>
        )}
      </Section>
      <Modal
        open={!!event}
        onClose={() => setSelected(null)}
        title="Обработка события"
      >
        {event && (
          <form onSubmit={advance} className={styles.form}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <div className={styles.row}>
              <Badge tone={event.urgency === "urgent" ? "red" : "amber"}>
                {event.title}
              </Badge>
              <Badge>{eventStatus[event.status]}</Badge>
            </div>
            <p className={styles.reviewText}>{event.detail}</p>
            <div className={styles.timeline}>
              {event.history.map((h, i) => (
                <div className={styles.timelineItem} key={`${h.at}-${i}`}>
                  <time>
                    {formatDate(h.at, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {h.by}
                  </time>
                  <h3>{eventStatus[h.status]}</h3>
                  <p>{h.note}</p>
                </div>
              ))}
            </div>
            {event.status !== "closed" && (
              <>
                <Textarea
                  label={
                    (
                      {
                        acknowledged: "Получение и ответственный",
                        assessed: "Клиническая оценка и её основание",
                        acted: "Какое действие выполнено",
                        closed: "Результат и основание закрытия",
                        created: "Комментарий",
                      } as Record<EventStatus, string>
                    )[nextStatus]
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                />
                <div className={styles.notice}>
                  Прочтение сообщения не считается выполненным клиническим
                  действием. Фиксируйте только фактически выполненный этап.
                </div>
                <div className={styles.formActions}>
                  <Button variant="secondary" onClick={() => setSelected(null)}>
                    Назад
                  </Button>
                  <Button type="submit" disabled={actions.busy}>
                    {
                      (
                        {
                          acknowledged: "Принять в работу",
                          assessed: "Зафиксировать оценку",
                          acted: "Зафиксировать действие",
                          closed: "Закрыть с результатом",
                          created: "Сохранить",
                        } as Record<EventStatus, string>
                      )[nextStatus]
                    }
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </Modal>
      {add && patient && (
        <NewEvent
          patient={patient}
          actions={actions}
          onClose={() => setAdd(false)}
        />
      )}
    </>
  );
}
function NewEvent({
  patient,
  actions,
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [urgency, setUrgency] = useState<CareEvent["urgency"]>("routine");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await actions.mutate(patient.id, {
        type: "event.add",
        value: {
          id: crypto.randomUUID(),
          createdAt: "",
          author: "",
          title,
          detail,
          urgency,
          status: "created",
          relatedId: "",
          dueAt: dueAt ? new Date(dueAt).toISOString() : "",
          assignee: patient.visits.at(-1)?.author ?? "Лечащий врач",
          assessment: "",
          action: "",
          outcome: "",
          history: [],
          sourceIds: [],
          rationale: detail,
        },
      });
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={onClose} title="Новое событие">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Field
          label="Что требует внимания"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Textarea
          label="Исходные сведения и причина"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          required
        />
        <Select
          label="Приоритет врача"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as typeof urgency)}
        >
          <option value="routine">Планово</option>
          <option value="important">Приоритетно</option>
          <option value="urgent">Срочно</option>
        </Select>
        <Field
          label="Контрольный срок"
          type="datetime-local"
          value={dueAt}
          min={localDateTime(new Date().toISOString())}
          onChange={(e) => setDueAt(e.target.value)}
        />
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy}>
            Создать событие
          </Button>
        </div>
      </form>
    </Modal>
  );
}
