import { useState, type FormEvent } from "react";
import type { CareEvent, EventStatus, PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import type { Navigate } from "./PatientDirectory";
import { message } from "./useWorkspace";
import { eventStatus, formatDate, localDateTime } from "./labels";
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
  const rows = (patient ? [patient] : patients.filter((p) => !p.archived))
    .flatMap((p) =>
      p.events
        .filter((e) => filter === "all" || e.status !== "closed")
        .map((event) => ({ patient: p, event })),
    )
    .sort(
      (a, b) =>
        ({ urgent: 0, important: 1, routine: 2 })[a.event.urgency] -
          { urgent: 0, important: 1, routine: 2 }[b.event.urgency] ||
        a.event.createdAt.localeCompare(b.event.createdAt),
    );
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
            <h1>События и внимание</h1>
            <p>От исходного сообщения до зафиксированного результата</p>
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
          className={styles.segmented}
          style={{ width: "fit-content", marginBottom: 15 }}
        >
          <button
            aria-pressed={filter === "open"}
            onClick={() => setFilter("open")}
          >
            В работе
          </button>
          <button
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Вся история
          </button>
        </div>
        {rows.map(({ patient: p, event: e }) => (
          <article className={styles.eventCard} key={e.id}>
            <div className={styles.between}>
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
                      important: "Приоритетно",
                      routine: "Планово",
                    }[e.urgency]
                  }
                </Badge>
                <Badge>{eventStatus[e.status]}</Badge>
              </div>
              <span className={styles.subtext}>
                {formatDate(e.createdAt, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <h3 style={{ marginTop: 12 }}>{e.title}</h3>
            {!patient && (
              <button
                className={styles.textButton}
                onClick={() => navigate(`/patients/${p.id}`)}
              >
                {p.profile.name}
              </button>
            )}
            <p>{e.detail}</p>
            <div className={styles.between}>
              <span className={styles.subtext}>
                {e.assignee}
                {e.dueAt ? ` · срок: ${formatDate(e.dueAt)}` : ""}
              </span>
              <Button
                variant="secondary"
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
            </div>
            <SourceLinks ids={e.sourceIds} />
          </article>
        ))}
        {!rows.length && (
          <Empty icon="check" title="Открытых событий нет">
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
