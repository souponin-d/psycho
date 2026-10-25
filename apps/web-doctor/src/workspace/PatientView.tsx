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
import { CarePlan, Referrals } from "./CarePlan";
import { PatientJournal, Messages } from "./PatientJournal";
import { Events } from "./Events";
import { Documents } from "./Documents";
import { SourceLinks } from "./SourceLibrary";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Modal,
  Section,
  Textarea,
  styles,
} from "./ui/Elements";
const tabs = [
  ["overview", "Обзор"],
  ["visits", "Приёмы"],
  ["dynamics", "Динамика"],
  ["plan", "План ведения"],
  ["journal", "Дневник"],
  ["events", "События"],
  ["messages", "Сообщения"],
  ["documents", "Документы"],
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
  const recent = patient.visits
    .filter((v) => v.status === "completed")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const openEvents = patient.events.filter(
    (event) => event.status !== "closed",
  ).length;
  const archiveBlocked = next.length > 0 || openEvents > 0;
  const archiveBlockReason = [
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
      <Button variant="ghost" icon="back" onClick={() => navigate("/patients")}>
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
              {patient.code} · {age(patient.profile.birthDate)} лет ·{" "}
              {formatDate(patient.profile.birthDate)}
              {patient.profile.occupation
                ? ` · ${patient.profile.occupation}`
                : ""}
            </p>
          </div>
        </div>
        <div className={styles.row}>
          <Button
            variant="secondary"
            icon="edit"
            onClick={() => setProfile(true)}
          >
            Профиль
          </Button>
          <Button
            icon="plus"
            onClick={() => setAppointment(true)}
            disabled={patient.archived}
          >
            Создать приём
          </Button>
        </div>
      </div>
      {patient.archived && (
        <div className={styles.notice}>Карта находится в архиве.</div>
      )}
      <nav className={styles.tabs} aria-label="Разделы карты">
        {tabs.map(([id, label]) => (
          <a
            key={id}
            href={`#/patients/${patient.id}/${id}`}
            aria-current={tab === id ? "page" : undefined}
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
            {label}
            {id === "events" &&
            patient.events.some((e) => e.status !== "closed")
              ? ` · ${patient.events.filter((e) => e.status !== "closed").length}`
              : ""}
          </a>
        ))}
      </nav>
      <div className={styles.stack}>
        {tab === "overview" && (
          <div className={styles.twoColumns}>
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
              <Section title="Контекст пациента">
                <dl className={styles.facts}>
                  {[
                    ["Цели", patient.profile.goals],
                    ["Аллергии", patient.profile.allergies],
                    [
                      "Сопутствующие заболевания",
                      patient.profile.clinicalContext.somaticConditions
                        .map((item) => `${item.code} ${item.title}`)
                        .join(", "),
                    ],
                    ["Текущие препараты", patient.profile.currentMedication],
                    ["Поддержка", patient.profile.socialContext],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {value || (
                          <span className={styles.subtext}>
                            Нет сведений · уточнить
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                <SourceLinks ids={["S02", "S03", "S04"]} />
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
                <SourceLinks ids={["S10", "S11"]} />
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
