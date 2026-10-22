import { useState, type FormEvent } from "react";
import type { Actor, Episode, PatientRecord, Profile } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import { createVisit } from "./commands";
import { formatDate, localDateTime, today } from "./labels";
import type { Navigate } from "./PatientDirectory";
import { SourceLinks } from "./SourceLibrary";
import {
  CurrentDraftValues,
  DraftConflict,
  useDraftGuard,
} from "./DraftConflict";
import {
  Button,
  ErrorNotice,
  Field,
  Modal,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";

const profileFields: { key: keyof Profile; label: string }[] = [
  { key: "allergies", label: "Аллергии и непереносимость" },
  { key: "conditions", label: "Соматические заболевания" },
  { key: "currentMedication", label: "Текущие препараты" },
  { key: "pastEpisodes", label: "Предыдущие эпизоды и лечение" },
  { key: "familyHistory", label: "Семейный анамнез" },
  { key: "substanceUse", label: "Алкоголь, ПАВ, другие вещества" },
  { key: "socialContext", label: "Социальный контекст и поддержка" },
  {
    key: "reproductiveContext",
    label: "Беременность, планирование, лактация — при применимости",
  },
  { key: "goals", label: "Цели пациента" },
];
const profileLabels: Record<string, string> = {
  name: "Фамилия, имя, отчество",
  birthDate: "Дата рождения",
  sex: "Пол",
  phone: "Телефон",
  email: "Электронная почта",
  occupation: "Род занятий",
  address: "Адрес",
  preferredContact: "Предпочтительный способ связи",
  emergencyContact: "Контакт на случай необходимости",
  representative: "Представитель и основание полномочий",
  ...Object.fromEntries(profileFields.map(({ key, label }) => [key, label])),
};
function profileValues(profile: Profile) {
  return {
    ...profile,
    sex: { unspecified: "Не указан", female: "Женский", male: "Мужской" }[
      profile.sex
    ],
  };
}
const episodeLabels: Record<string, string> = {
  title: "Название / повод наблюдения",
  startedOn: "Дата начала",
  status: "Статус",
  phase: "Этап",
  diagnosis: "Диагноз / гипотеза",
  diagnosisStatus: "Степень подтверждения",
  endDate: "Дата завершения",
  summary: "Итог эпизода",
};
function episodeValues(episode: Episode) {
  return {
    ...episode,
    status: {
      active: "Активное наблюдение",
      remission: "Ремиссия, наблюдение продолжается",
      closed: "Завершён",
    }[episode.status],
    phase: {
      assessment: "Диагностическая оценка",
      acute: "Острая фаза",
      continuation: "Продолжение лечения",
      maintenance: "Поддерживающий этап",
    }[episode.phase],
    diagnosisStatus: {
      hypothesis: "Рабочая гипотеза",
      confirmed: "Подтверждён психиатром",
    }[episode.diagnosisStatus],
  };
}
export function ProfileForm({
  patient,
  actions,
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
}) {
  const [value, setValue] = useState(patient.profile);
  const [error, setError] = useState("");
  const current = patient.profile;
  const guard = useDraftGuard(current, patient.revision);
  const set = (key: keyof Profile, v: string) =>
    setValue({ ...value, [key]: v });
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (guard.conflict)
        throw new Error(
          "Профиль изменён в другой сессии. Сравните данные и выберите, какие изменения сохранить.",
        );
      await actions.mutate(
        patient.id,
        { type: "profile.update", value },
        guard.expectedRevision,
      );
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={onClose} title="Профиль и контекст пациента">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <DraftConflict
          guard={guard}
          onReload={() => {
            setValue(current);
            setError("");
          }}
        >
          <CurrentDraftValues
            current={profileValues(current)}
            draft={profileValues(value)}
            labels={profileLabels}
          />
        </DraftConflict>
        <Field
          label="Фамилия, имя, отчество"
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
        <div className={styles.formPair}>
          <Field
            label="Дата рождения"
            type="date"
            value={value.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
            required
          />
          <Select
            label="Пол"
            value={value.sex}
            onChange={(e) => set("sex", e.target.value)}
          >
            <option value="unspecified">Не указан</option>
            <option value="female">Женский</option>
            <option value="male">Мужской</option>
          </Select>
        </div>
        <div className={styles.formPair}>
          <Field
            label="Телефон"
            type="tel"
            value={value.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
          <Field
            label="Электронная почта"
            type="email"
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <Field
          label="Род занятий"
          value={value.occupation}
          onChange={(e) => set("occupation", e.target.value)}
        />
        <Field
          label="Адрес"
          value={value.address}
          onChange={(e) => set("address", e.target.value)}
        />
        <Field
          label="Предпочтительный способ связи"
          value={value.preferredContact}
          onChange={(e) => set("preferredContact", e.target.value)}
        />
        <Field
          label="Контакт на случай необходимости"
          hint="Наличие контакта не предоставляет доступ к карте"
          value={value.emergencyContact}
          onChange={(e) => set("emergencyContact", e.target.value)}
        />
        <Field
          label="Представитель и основание полномочий"
          value={value.representative}
          onChange={(e) => set("representative", e.target.value)}
        />
        <div className={styles.notice}>
          Пустое поле означает отсутствие сведений. Для отрицательного ответа
          укажите его явно и отметьте источник в тексте, например «со слов
          пациента».
        </div>
        {profileFields.map(({ key, label }) => (
          <Textarea
            key={key}
            label={label}
            value={value[key]}
            onChange={(e) => set(key, e.target.value)}
            rows={2}
          />
        ))}
        <SourceLinks ids={["S01", "S02", "S03", "S04"]} />
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy || guard.conflict}>
            Сохранить профиль
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function AppointmentForm({
  patient,
  actor,
  actions,
  navigate,
  onClose,
  initialDate,
}: {
  patient: PatientRecord;
  actor: Actor;
  actions: WorkspaceActions;
  navigate: Navigate;
  onClose: () => void;
  initialDate?: string;
}) {
  const [when, setWhen] = useState(() =>
    localDateTime(
      initialDate && Number.isFinite(Date.parse(initialDate))
        ? initialDate
        : new Date().toISOString(),
    ),
  );
  const [kind, setKind] = useState<"initial" | "follow-up" | "unscheduled">(
    patient.visits.length ? "follow-up" : "initial",
  );
  const [format, setFormat] = useState<"in-person" | "remote">("in-person");
  const [duration, setDuration] = useState("45");
  const [reason, setReason] = useState("");
  const [episodeId, setEpisodeId] = useState(
    patient.episodes.find((e) => e.status === "active")?.id ?? "",
  );
  const [error, setError] = useState("");
  const startsAt = Date.parse(when);
  const durationMinutes = Number(duration);
  const endsAt = startsAt + durationMinutes * 60_000;
  const conflicts = actions.patients
    .filter((p) => !p.archived)
    .flatMap((p) =>
      p.visits
        .filter((visit) => {
          if (visit.status !== "scheduled" && visit.status !== "in-progress")
            return false;
          const existingStart = Date.parse(visit.scheduledAt);
          if (!Number.isFinite(startsAt) || !Number.isFinite(existingStart))
            return false;
          if (existingStart === startsAt) return true;
          if (
            !Number.isFinite(durationMinutes) ||
            durationMinutes <= 0 ||
            !Number.isFinite(visit.durationMinutes) ||
            visit.durationMinutes <= 0
          )
            return false;
          const existingEnd = existingStart + visit.durationMinutes * 60_000;
          return startsAt < existingEnd && existingStart < endsAt;
        })
        .map((visit) => ({ patientName: p.profile.name, visit })),
    );
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const v = createVisit(
        crypto.randomUUID(),
        new Date(when).toISOString(),
        actor,
      );
      await actions.mutate(patient.id, {
        type: "visit.save",
        value: {
          ...v,
          kind,
          format,
          durationMinutes: Number(duration),
          reason,
          episodeId,
        },
      });
      onClose();
      navigate(`/patients/${patient.id}/visits/${v.id}`);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={onClose} title="Запланировать приём">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <h3>{patient.profile.name}</h3>
        <Field
          label="Дата и время"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
          hint={Intl.DateTimeFormat().resolvedOptions().timeZone}
        />
        {conflicts.length > 0 && (
          <div className={styles.notice} role="status">
            <strong>Время пересекается с существующей записью</strong>
            <ul>
              {conflicts.map(({ patientName, visit }) => (
                <li key={visit.id}>
                  {patientName} ·{" "}
                  {formatDate(visit.scheduledAt, {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {Number.isFinite(visit.durationMinutes) &&
                    visit.durationMinutes > 0 &&
                    ` · ${visit.durationMinutes} мин`}
                </li>
              ))}
            </ul>
            Проверьте время перед созданием приёма. При необходимости вы можете
            сохранить запись с пересечением.
          </div>
        )}
        <div className={styles.formPair}>
          <Select
            label="Тип приёма"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="initial">Первичный</option>
            <option value="follow-up">Повторный</option>
            <option value="unscheduled">Внеплановый</option>
          </Select>
          <Field
            label="Продолжительность, минут"
            type="number"
            min={5}
            max={240}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
          />
        </div>
        <Select
          label="Формат"
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
        >
          <option value="in-person">Очно</option>
          <option value="remote">Дистанционный контакт</option>
        </Select>
        {format === "remote" && (
          <>
            <div className={styles.notice}>
              Зафиксируйте допустимый объём дистанционного контакта, основание и
              согласие. Этот интерфейс не заменяет отдельную систему
              телемедицинской идентификации и подписания документов.
            </div>
            <SourceLinks ids={["S11", "S15"]} />
          </>
        )}
        <Select
          label="Эпизод наблюдения"
          value={episodeId}
          onChange={(e) => setEpisodeId(e.target.value)}
        >
          <option value="">Пока не определён</option>
          {patient.episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {ep.title}
            </option>
          ))}
        </Select>
        <Textarea
          label="Причина обращения / повестка"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy} icon="calendar">
            Создать приём
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function EpisodeForm({
  patient,
  actor,
  actions,
  onClose,
  episode,
}: {
  patient: PatientRecord;
  actor: Actor;
  actions: WorkspaceActions;
  onClose: () => void;
  episode?: Episode;
}) {
  const [value, setValue] = useState<Episode>(
    episode ?? {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      author: actor.name,
      title: "",
      startedOn: today(),
      status: "active",
      phase: "assessment",
      diagnosis: "",
      diagnosisStatus: "hypothesis",
      endDate: "",
      summary: "",
    },
  );
  const [error, setError] = useState("");
  const current = patient.episodes.find((item) => item.id === value.id);
  const guard = useDraftGuard(current, patient.revision);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (guard.conflict)
        throw new Error(
          "Эпизод изменён в другой сессии. Сравните данные и выберите, какие изменения сохранить.",
        );
      await actions.mutate(
        patient.id,
        { type: "episode.save", value },
        guard.expectedRevision,
      );
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={episode ? "Эпизод наблюдения" : "Новый эпизод"}
    >
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <DraftConflict
          guard={guard}
          onReload={() => {
            if (current) setValue(current);
            setError("");
          }}
        >
          <CurrentDraftValues
            current={current ? episodeValues(current) : undefined}
            draft={episodeValues(value)}
            labels={episodeLabels}
          />
        </DraftConflict>
        <Field
          label="Название / повод наблюдения"
          value={value.title}
          onChange={(e) => setValue({ ...value, title: e.target.value })}
          required
        />
        <Field
          label="Дата начала"
          type="date"
          value={value.startedOn}
          onChange={(e) => setValue({ ...value, startedOn: e.target.value })}
          required
        />
        <Select
          label="Статус"
          value={value.status}
          onChange={(e) =>
            setValue({ ...value, status: e.target.value as Episode["status"] })
          }
        >
          <option value="active">Активное наблюдение</option>
          <option value="remission">Ремиссия, наблюдение продолжается</option>
          <option value="closed">Завершён</option>
        </Select>
        <Select
          label="Этап"
          value={value.phase}
          onChange={(e) =>
            setValue({ ...value, phase: e.target.value as Episode["phase"] })
          }
        >
          <option value="assessment">Диагностическая оценка</option>
          <option value="acute">Острая фаза</option>
          <option value="continuation">Продолжение лечения</option>
          <option value="maintenance">Поддерживающий этап</option>
        </Select>
        <Field
          label="Диагноз / гипотеза"
          value={value.diagnosis}
          onChange={(e) => setValue({ ...value, diagnosis: e.target.value })}
        />
        <Select
          label="Степень подтверждения"
          value={value.diagnosisStatus}
          onChange={(e) =>
            setValue({
              ...value,
              diagnosisStatus: e.target.value as Episode["diagnosisStatus"],
            })
          }
        >
          <option value="hypothesis">Рабочая гипотеза</option>
          <option
            value="confirmed"
            disabled={actor.specialty !== "psychiatrist"}
          >
            Подтверждён психиатром
          </option>
        </Select>
        {value.status === "closed" && (
          <>
            <Field
              label="Дата завершения"
              type="date"
              required
              value={value.endDate}
              onChange={(e) => setValue({ ...value, endDate: e.target.value })}
            />
            <Textarea
              label="Итог эпизода"
              required
              value={value.summary}
              onChange={(e) => setValue({ ...value, summary: e.target.value })}
            />
          </>
        )}
        <div className={styles.notice}>
          Эпизод наблюдения в приложении не устанавливает юридический статус
          диспансерного наблюдения.
        </div>
        <SourceLinks ids={["S10", "S18"]} />
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy || guard.conflict}>
            Сохранить эпизод
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function ConsentForm({
  patient,
  actions,
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
}) {
  const [purpose, setPurpose] = useState<
    "care" | "data" | "communication" | "disclosure"
  >("care");
  const [status, setStatus] = useState<"documented" | "refused" | "withdrawn">(
    "documented",
  );
  const [signedOn, setSignedOn] = useState(today());
  const [reference, setReference] = useState("");
  const [person, setPerson] = useState(patient.profile.name);
  const [scope, setScope] = useState("");
  const [informing, setInforming] = useState("");
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await actions.mutate(patient.id, {
        type: "consent.add",
        value: {
          id: crypto.randomUUID(),
          createdAt: "",
          author: "",
          purpose,
          status,
          signedOn,
          documentReference: reference,
          person,
          scope,
          informing,
        },
      });
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={onClose} title="Зафиксировать согласие или отказ">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className={styles.notice}>
          Запись отражает уже оформленный документ. Нажатие кнопки не заменяет
          подпись пациента или представителя.
        </div>
        <Select
          label="Назначение документа"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as typeof purpose)}
        >
          <option value="care">Медицинская помощь</option>
          <option value="data">Обработка данных</option>
          <option value="communication">Дистанционная связь</option>
          <option value="disclosure">Раскрытие сведений</option>
        </Select>
        <Select
          label="Волеизъявление"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="documented">Согласие документировано</option>
          <option value="refused">Отказ</option>
          <option value="withdrawn">Отзыв ранее данного согласия</option>
        </Select>
        <Field
          label="Дата документа"
          type="date"
          value={signedOn}
          onChange={(e) => setSignedOn(e.target.value)}
          required
        />
        <Field
          label="Номер / ссылка на документ"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
        />
        <Field
          label="Пациент / представитель и основание"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          required
        />
        <Textarea
          label="Объём и адресат"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={2}
        />
        <Textarea
          label="Содержание информирования"
          hint="Цели, методы, альтернативы, ожидаемые результаты и риски"
          value={informing}
          onChange={(e) => setInforming(e.target.value)}
          required={status === "documented"}
        />
        <SourceLinks ids={["S10", "S11"]} />
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy}>
            Зафиксировать
          </Button>
        </div>
      </form>
    </Modal>
  );
}
