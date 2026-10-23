import { useState, type FormEvent } from "react";
import type { PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import { age, formatDate, formatTime, initials, visitStatus } from "./labels";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Icon,
  Modal,
  Select,
  styles,
} from "./ui/Elements";
export type Navigate = (path: string) => void;
export function NewPatient({
  open,
  onClose,
  actions,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  actions: WorkspaceActions;
  navigate: Navigate;
}) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "unspecified">(
    "unspecified",
  );
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const p = await actions.create({ name, birthDate, sex });
      setName("");
      setBirthDate("");
      onClose();
      navigate(`/patients/${p.id}`);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Новый пациент">
      <form className={styles.form} onSubmit={submit}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <p className={styles.subtext}>
          Создайте карту. Анамнез, согласия и детали можно заполнить в ней или
          во время приёма.
        </p>
        <Field
          label="Фамилия, имя, отчество"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="off"
          maxLength={200}
        />
        <div className={styles.formPair}>
          <Field
            label="Дата рождения"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
          <Select
            label="Пол"
            value={sex}
            onChange={(e) => setSex(e.target.value as typeof sex)}
          >
            <option value="unspecified">Не указан</option>
            <option value="female">Женский</option>
            <option value="male">Мужской</option>
          </Select>
        </div>
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy} icon="plus">
            Создать карту
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function PatientDirectory({
  patients,
  navigate,
  onCreate,
}: {
  patients: PatientRecord[];
  navigate: Navigate;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const filtered = patients
    .filter(
      (p) =>
        (filter === "archived" ? p.archived : !p.archived) &&
        (filter !== "attention" ||
          p.events.some((e) => e.status !== "closed")) &&
        `${p.profile.name} ${p.code} ${p.profile.phone}`
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru")),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>Пациенты</h1>
          <p>История, планы и динамика — в одном рабочем контексте</p>
        </div>
        <Button icon="plus" onClick={onCreate}>
          Новый пациент
        </Button>
      </div>
      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Icon name="search" size={17} />
            <input
              aria-label="Поиск пациента"
              placeholder="Имя, номер карты или телефон"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className={styles.segmented}>
            {[
              ["active", "Наблюдаются"],
              ["attention", "Требуют внимания"],
              ["archived", "Архив"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id!)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Пациент</th>
                  <th>Текущий эпизод</th>
                  <th>Следующий приём</th>
                  <th>Обновление</th>
                  <th>
                    <span className={styles.subtext}>Открыть</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const visit = p.visits
                    .filter(
                      (v) =>
                        v.status === "scheduled" || v.status === "in-progress",
                    )
                    .sort((a, b) =>
                      a.scheduledAt.localeCompare(b.scheduledAt),
                    )[0];
                  const events = p.events.filter((e) => e.status !== "closed");
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className={styles.patientName}>
                          <div className={styles.avatar}>
                            {initials(p.profile.name)}
                          </div>
                          <div>
                            <button
                              className={styles.textButton}
                              onClick={() => navigate(`/patients/${p.id}`)}
                            >
                              {p.profile.name}
                            </button>
                            <div className={styles.subtext}>
                              {p.code} · {age(p.profile.birthDate)} лет
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {p.episodes.find((e) => e.status === "active")?.title ??
                          "Эпизод не открыт"}
                        {events.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <Badge tone="amber">
                              {events.length} · требуют внимания
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td>
                        {visit ? (
                          <>
                            <span>
                              {formatDate(visit.scheduledAt, {
                                day: "numeric",
                                month: "short",
                              })}{" "}
                              · {formatTime(visit.scheduledAt)}
                            </span>
                            <div className={styles.subtext}>
                              {visitStatus[visit.status]}
                            </div>
                          </>
                        ) : (
                          <span className={styles.subtext}>Не назначен</span>
                        )}
                      </td>
                      <td>
                        {formatDate(p.updatedAt, {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          icon="chevron"
                          aria-label={`Открыть карту: ${p.profile.name}`}
                          onClick={() => navigate(`/patients/${p.id}`)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon="people"
            title={query ? "Пациенты не найдены" : "Пока нет пациентов"}
            action={
              !query ? (
                <Button icon="plus" onClick={onCreate}>
                  Создать карту
                </Button>
              ) : undefined
            }
          >
            {query
              ? "Попробуйте другой запрос или измените фильтр."
              : "Создайте первую карту, чтобы запланировать приём и начать наблюдение."}
          </Empty>
        )}
        <div className={styles.tableFooter}>
          Показано: {filtered.length} · доступные вам карты пациентов
        </div>
      </section>
    </>
  );
}
