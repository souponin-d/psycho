import { WorkflowPanel } from "./ClinicalWorkflow";
import { ClinicalSupportPanel } from "./ClinicalSupportPanel";
import { AdherencePanel } from "./AdherencePanel";
import { useId, useState, type FormEvent } from "react";
import type { Actor, Episode, PatientRecord } from "./model";
import { message, type WorkspaceActions } from "./useWorkspace";
import type { Navigate } from "./PatientDirectory";
import { age, formatDate, initials } from "./labels";
import {
  AppointmentForm,
  ConsentForm,
  EpisodeForm,
  ProfileForm,
} from "./PatientForms";
import { AppointmentRow } from "./Workday";
import { Dynamics } from "./Dynamics";
import { PlanForm, CarePlan, Referrals } from "./CarePlan";
import { PatientJournal, Messages } from "./PatientJournal";
import { Events } from "./Events";
import { Documents } from "./Documents";
import { SourceLinks } from "./SourceLibrary";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Icon,
  Modal,
  Section,
  Textarea,
  styles,
} from "./ui/Elements";
import { PatientContext } from "./PatientContext";
const tabs = [
  ["overview", "Обзор", "file"],
  ["visits", "Приёмы", "calendar"],
  ["plan", "Лечение и план", "pill"],
  ["dynamics", "Наблюдение и шкалы", "chart"],
  ["documents", "Документы", "book"],
] as const;
const observationTabs = [
  ["dynamics", "Динамика"],
  ["journal", "Дневник"],
  ["events", "События"],
  ["messages", "Сообщения"],
];
export function PatientView({
  patient,
  actor,
  actions,
  navigate,
  tab = "overview",
  server,
}: {
  patient: PatientRecord;
  actor: Actor;
  actions: WorkspaceActions;
  navigate: Navigate;
  tab?: string;
  server: boolean;
}) {
  const patientAge = age(patient.profile.birthDate);
  const ageUnit = {
    one: "год",
    few: "года",
    many: "лет",
    other: "лет",
    zero: "лет",
    two: "года",
  }[new Intl.PluralRules("ru").select(patientAge)];
  const [prescription, setPrescription] = useState(false);
  const observation = observationTabs.some(([id]) => id === tab);
  const [profile, setProfile] = useState(false);
  const [appointment, setAppointment] = useState(false);
  const [episode, setEpisode] = useState<Episode | "new" | null>(null);
  const [consent, setConsent] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<boolean | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [reasonError, setReasonError] = useState("");
  const archiveHintId = useId();
  const next = patient.visits
    .filter((v) => v.status === "scheduled" || v.status === "in-progress")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const currentVisit = next.find((v) => v.status === "in-progress") || next[0];
  const recent = patient.visits
    .filter((v) => v.status === "completed")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const openEvents = patient.events.filter(
    (event) => event.status !== "closed",
  ).length;
  const openSafety =
    patient.workflow?.safety.filter((e) => e.status !== "acted").length ?? 0;
  const archiveBlocked = next.length > 0 || openEvents > 0 || openSafety > 0;
  const archiveBlockReason = [
    openSafety > 0 ? `Завершите оценку безопасности: ${openSafety}.` : "",
    next.length > 0
      ? `Сначала завершите или отмените предстоящие и текущие приёмы: ${next.length}.`
      : "",
    openEvents > 0
      ? `Завершите обработку открытых событий: ${openEvents}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  async function changeArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (archiveTarget === null) return;
    setArchiveError("");
    setReasonError("");
    const reason = archiveReason.trim();
    if (!reason) {
      setReasonError("Укажите основание изменения статуса карты.");
      event.currentTarget.querySelector("textarea")?.focus();
      return;
    }
    if (archiveTarget && archiveBlocked) {
      setArchiveError(archiveBlockReason);
      return;
    }
    try {
      await actions.mutate(patient.id, {
        type: "patient.archive",
        archived: archiveTarget,
        reason,
      });
      setArchiveTarget(null);
    } catch (error) {
      setArchiveError(message(error));
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        icon="back"
        className={styles.patientBackLink}
        onClick={() => navigate("/patients")}
      >
        Все пациенты
      </Button>
      <div className={styles.patientHeader}>
        <div className={styles.patientName}>
          <div className={`${styles.avatar} ${styles.avatarLarge}`}>
            {initials(patient.profile.name)}
          </div>
          <div>
            <h1>{patient.profile.name}</h1>
            <p className={styles.subtext}>
              {patient.code} · {patientAge} {ageUnit} ·{" "}
              {formatDate(patient.profile.birthDate)}
              {patient.profile.occupation
                ? ` · ${patient.profile.occupation}`
                : ""}
            </p>
          </div>
        </div>
        <div className={styles.row}>
          <Button variant="ghost" icon="edit" onClick={() => setProfile(true)}>
            Редактировать
          </Button>
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => setPrescription(true)}
            disabled={patient.archived}
          >
            Назначить препарат
          </Button>
          <Button
            icon="arrow"
            onClick={() =>
              currentVisit
                ? navigate(`/patients/${patient.id}/visits/${currentVisit.id}`)
                : setAppointment(true)
            }
            disabled={patient.archived}
          >
            {currentVisit
              ? currentVisit.status === "in-progress"
                ? "Продолжить приём"
                : "Открыть приём"
              : "Запланировать приём"}
          </Button>
        </div>
      </div>
      {patient.archived && (
        <div className={styles.notice}>Карта находится в архиве.</div>
      )}
      <nav className={styles.tabs} aria-label="Разделы карты">
        {tabs.map(([id, label, icon]) => (
          <a
            key={id}
            href={`#/patients/${patient.id}/${id}`}
            aria-current={
              tab === id || (id === "dynamics" && observation)
                ? "page"
                : undefined
            }
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              navigate(`/patients/${patient.id}/${id}`);
            }}
          >
            <Icon name={icon} size={15} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      {observation && (
        <nav className={styles.observationTabs} aria-label="Разделы наблюдения">
          {observationTabs.map(([id, label]) => (
            <a
              key={id}
              href={`#/patients/${patient.id}/${id}`}
              aria-current={tab === id ? "page" : undefined}
              onClick={(event) => {
                if (
                  event.button ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                navigate(`/patients/${patient.id}/${id}`);
              }}
            >
              {label}
              {id === "events" && openEvents > 0 ? ` · ${openEvents}` : ""}
            </a>
          ))}
        </nav>
      )}
      <div className={styles.stack}>
        {tab === "overview" && (
          <PatientContext patient={patient} actions={actions} />
        )}
        {tab === "overview" && (
          <ClinicalSupportPanel
            patient={patient}
            actor={actor}
            actions={actions}
          />
        )}
        {tab === "overview" && (
          <WorkflowPanel patient={patient} actions={actions} />
        )}
        {tab === "overview" && (
          <div className={styles.twoColumns}>
            <div className={styles.stack}>
              <Dynamics patient={patient} actions={actions} compact />
              <Section
                title="История наблюдения"
                action={
                  <Button
                    variant="ghost"
                    onClick={() => setEpisode("new")}
                    icon="plus"
                  >
                    Эпизод
                  </Button>
                }
              >
                <div className={styles.timeline}>
                  {patient.episodes.map((ep) => (
                    <div className={styles.timelineItem} key={ep.id}>
                      <time>
                        {formatDate(ep.startedOn)} ·{" "}
                        {
                          {
                            active: "Наблюдение продолжается",
                            remission: "Ремиссия",
                            closed: "Завершён",
                          }[ep.status]
                        }
                      </time>
                      <button
                        className={styles.textButton}
                        onClick={() => setEpisode(ep)}
                      >
                        {ep.title}
                      </button>
                      <p>
                        {ep.diagnosis || "Диагноз ещё не подтверждён"}
                        {ep.diagnosis && ep.diagnosisStatus === "hypothesis"
                          ? " · рабочая гипотеза"
                          : ""}
                      </p>
                      {ep.summary && <p>{ep.summary}</p>}
                    </div>
                  ))}
                </div>
                {!patient.episodes.length && (
                  <Empty
                    title="Откройте эпизод наблюдения"
                    icon="activity"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => setEpisode("new")}
                      >
                        Новый эпизод
                      </Button>
                    }
                  >
                    Объедините связанные приёмы, цели и контрольные точки.
                  </Empty>
                )}
              </Section>
            </div>
            <div className={styles.stack}>
              <Section
                title="Ближайший приём"
                action={
                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/patients/${patient.id}/visits`)}
                  >
                    Вся история
                  </Button>
                }
              >
                {next[0] ? (
                  <AppointmentRow
                    patient={patient}
                    visit={next[0]}
                    navigate={navigate}
                  />
                ) : (
                  <Empty
                    title="Следующий приём не назначен"
                    icon="calendar"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => setAppointment(true)}
                      >
                        Выбрать время
                      </Button>
                    }
                  >
                    Согласуйте контрольную точку и добавьте её в расписание.
                  </Empty>
                )}
              </Section>

              <Section
                title="Согласия и волеизъявление"
                action={
                  <Button
                    variant="ghost"
                    icon="plus"
                    onClick={() => setConsent(true)}
                  >
                    Запись
                  </Button>
                }
              >
                {patient.consents
                  .slice()
                  .reverse()
                  .map((c) => (
                    <div className={styles.inlineNote} key={c.id}>
                      <div className={styles.between}>
                        <h3>
                          {
                            {
                              care: "Медицинская помощь",
                              data: "Обработка данных",
                              communication: "Дистанционная связь",
                              disclosure: "Раскрытие сведений",
                            }[c.purpose]
                          }
                        </h3>
                        <Badge
                          tone={c.status === "documented" ? "green" : "amber"}
                        >
                          {
                            {
                              documented: "Документировано",
                              refused: "Отказ",
                              withdrawn: "Отозвано",
                            }[c.status]
                          }
                        </Badge>
                      </div>
                      <p>
                        {c.documentReference} · {formatDate(c.signedOn)}
                      </p>
                    </div>
                  ))}
                {!patient.consents.length && (
                  <p className={styles.subtext}>
                    Сведения о документах ещё не внесены.
                  </p>
                )}
                <details className={styles.details}>
                  <summary>Основания</summary>
                  <SourceLinks ids={["S10", "S11"]} />
                </details>
              </Section>
              {recent[0] && (
                <Section title="После последнего приёма">
                  <p className={styles.reviewText}>
                    {recent[0].notes.recommendations ||
                      recent[0].notes.conclusion}
                  </p>
                  <Button
                    variant="ghost"
                    icon="arrow"
                    onClick={() =>
                      navigate(
                        `/patients/${patient.id}/visits/${recent[0]!.id}`,
                      )
                    }
                  >
                    Открыть заключение
                  </Button>
                </Section>
              )}
              <Section title="Статус карты">
                <p className={styles.reviewText}>
                  {patient.archived
                    ? "Карта в архиве. История сохранена; для продолжения работы верните пациента в наблюдение."
                    : "Карта участвует в текущем наблюдении. Перенос в архив сохраняет историю и основание решения."}
                </p>
                {!patient.archived && archiveBlocked && (
                  <p
                    id={archiveHintId}
                    className={styles.notice}
                    style={{ marginTop: 12 }}
                  >
                    {archiveBlockReason}
                  </p>
                )}
                <Button
                  variant="secondary"
                  style={{ marginTop: 14 }}
                  disabled={!patient.archived && archiveBlocked}
                  aria-describedby={
                    !patient.archived && archiveBlocked
                      ? archiveHintId
                      : undefined
                  }
                  onClick={() => {
                    setArchiveTarget(!patient.archived);
                    setArchiveReason("");
                    setArchiveError("");
                    setReasonError("");
                  }}
                >
                  {patient.archived
                    ? "Вернуть в наблюдение"
                    : "Перенести в архив"}
                </Button>
              </Section>
            </div>
          </div>
        )}
        {tab === "visits" && (
          <>
            <Section
              title="Предстоящие и текущие"
              action={
                <Button icon="plus" onClick={() => setAppointment(true)}>
                  Создать приём
                </Button>
              }
            >
              {next.map((v) => (
                <AppointmentRow
                  key={v.id}
                  patient={patient}
                  visit={v}
                  navigate={navigate}
                />
              ))}
              {!next.length && (
                <Empty title="Предстоящих приёмов нет" icon="calendar">
                  Добавьте первичный или контрольный приём.
                </Empty>
              )}
            </Section>
            <Section title="Завершённые приёмы">
              {recent.map((v) => (
                <article className={styles.inlineNote} key={v.id}>
                  <div className={styles.between}>
                    <h3>
                      {formatDate(v.scheduledAt)} ·{" "}
                      {v.kind === "initial" ? "Первичный" : "Повторный"}
                    </h3>
                    <Button
                      variant="ghost"
                      icon="arrow"
                      onClick={() =>
                        navigate(`/patients/${patient.id}/visits/${v.id}`)
                      }
                    >
                      Заключение
                    </Button>
                  </div>
                  <p>{v.notes.conclusion}</p>
                </article>
              ))}
              {!recent.length && (
                <Empty title="История начнётся с первого приёма" icon="file">
                  Подтверждённые итоги сохраняются здесь вместе с автором,
                  временем и последующими дополнениями.
                </Empty>
              )}
            </Section>
            {patient.visits.some((v) => v.status === "cancelled") && (
              <Section title="Отменённые">
                {patient.visits
                  .filter((v) => v.status === "cancelled")
                  .map((v) => (
                    <div className={styles.inlineNote} key={v.id}>
                      <h3>{formatDate(v.scheduledAt)}</h3>
                      <p>{v.cancellationReason}</p>
                    </div>
                  ))}
              </Section>
            )}
          </>
        )}
        {tab === "dynamics" && <Dynamics patient={patient} actions={actions} />}
        {tab === "plan" && (
          <>
            <CarePlan patient={patient} actions={actions} />
            <AdherencePanel patient={patient} actor={actor} actions={actions} />
            <Section
              title="Контроль и договорённости"
              action={
                <Button
                  variant="ghost"
                  icon="calendar"
                  disabled={patient.archived}
                  onClick={() => setAppointment(true)}
                >
                  Запланировать контакт
                </Button>
              }
            >
              {currentVisit ? (
                <div className={styles.agreementRow}>
                  <Icon name="calendar" size={18} />
                  <div>
                    <strong>Ближайший контакт</strong>
                    <p className={styles.subtext}>
                      {formatDate(currentVisit.scheduledAt, {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    icon="arrow"
                    onClick={() =>
                      navigate(
                        `/patients/${patient.id}/visits/${currentVisit.id}`,
                      )
                    }
                  >
                    Открыть приём
                  </Button>
                </div>
              ) : (
                <p className={styles.subtext}>
                  Следующий контакт не запланирован
                </p>
              )}
              {patient.plan
                .filter(
                  (item) =>
                    item.status === "confirmed" && item.patientInstructions,
                )
                .map((item) => (
                  <div className={styles.agreementRow} key={item.id}>
                    <Icon name="file" size={18} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.patientInstructions}</p>
                    </div>
                  </div>
                ))}
              <Button
                variant="ghost"
                icon="book"
                onClick={() => navigate(`/patients/${patient.id}/journal`)}
              >
                Дневник самочувствия
              </Button>
            </Section>
            <Referrals patient={patient} actions={actions} />
          </>
        )}
        {tab === "journal" && (
          <PatientJournal patient={patient} actions={actions} />
        )}
        {tab === "events" && (
          <Events
            patient={patient}
            patients={actions.patients}
            actions={actions}
            navigate={navigate}
          />
        )}
        {tab === "messages" && (
          <Messages patient={patient} actions={actions} server={server} />
        )}
        {tab === "documents" && (
          <Documents patient={patient} actions={actions} />
        )}
      </div>
      {prescription && (
        <PlanForm
          patient={patient}
          actions={actions}
          initialKind="medication"
          onClose={() => setPrescription(false)}
        />
      )}
      {profile && (
        <ProfileForm
          patient={patient}
          actions={actions}
          onClose={() => setProfile(false)}
        />
      )}{" "}
      {appointment && (
        <AppointmentForm
          patient={patient}
          actor={actor}
          actions={actions}
          navigate={navigate}
          onClose={() => setAppointment(false)}
        />
      )}{" "}
      {episode && (
        <EpisodeForm
          patient={patient}
          actor={actor}
          actions={actions}
          episode={episode === "new" ? undefined : episode}
          onClose={() => setEpisode(null)}
        />
      )}{" "}
      {consent && (
        <ConsentForm
          patient={patient}
          actions={actions}
          onClose={() => setConsent(false)}
        />
      )}
      <Modal
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title={
          archiveTarget
            ? "Перенести карту в архив"
            : "Вернуть карту в наблюдение"
        }
      >
        <form className={styles.form} onSubmit={changeArchive}>
          <h3>{patient.profile.name}</h3>
          {archiveError && <ErrorNotice>{archiveError}</ErrorNotice>}
          <p className={styles.reviewText}>
            {archiveTarget
              ? "Карта перейдёт в архив. История наблюдения и документы сохранятся. Возобновить наблюдение можно из обзора карты."
              : "Карта снова появится среди наблюдаемых пациентов. Предыдущая история и документы останутся доступны."}
          </p>
          {archiveTarget && archiveBlocked && (
            <ErrorNotice>{archiveBlockReason}</ErrorNotice>
          )}
          <Textarea
            label={
              archiveTarget
                ? "Основание переноса в архив"
                : "Основание возобновления наблюдения"
            }
            value={archiveReason}
            onChange={(event) => {
              setArchiveReason(event.target.value);
              setReasonError("");
            }}
            error={reasonError}
            required
            maxLength={2000}
          />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={
                actions.busy || (archiveTarget === true && archiveBlocked)
              }
            >
              {archiveTarget
                ? "Подтвердить перенос в архив"
                : "Подтвердить возобновление"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
