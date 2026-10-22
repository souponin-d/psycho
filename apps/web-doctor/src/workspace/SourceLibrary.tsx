import { createContext, useContext, useState, type ReactNode } from "react";
import { sources, sourceById } from "./sources";
import {
  Badge,
  Button,
  Empty,
  Field,
  Icon,
  Modal,
  styles,
} from "./ui/Elements";
const SourceContext = createContext<(id: string) => void>(() => {});
export function SourceProvider({
  children,
  server,
}: {
  children: ReactNode;
  server: boolean;
}) {
  const [selected, setSelected] = useState("");
  const source = sourceById(selected);
  return (
    <SourceContext.Provider value={setSelected}>
      {children}
      <Modal
        open={!!source}
        onClose={() => setSelected("")}
        title={source ? `${source.id} · Паспорт источника` : "Источник"}
      >
        {source && (
          <div className={styles.stack}>
            <h3>{source.title}</h3>
            <Badge tone={source.activation === "historical" ? "red" : "amber"}>
              {source.activation === "historical"
                ? "Исторический документ"
                : source.activation === "conditional"
                  ? "Применимость зависит от процесса"
                  : "Требуется проверка перед активацией правил"}
            </Badge>
            <dl className={styles.facts}>
              <div>
                <dt>Редакция</dt>
                <dd>{source.edition}</dd>
              </div>
              <div>
                <dt>Проверка</dt>
                <dd>{source.status}</dd>
              </div>
              <div>
                <dt>Где искать</dt>
                <dd>{source.locator}</dd>
              </div>
              <div>
                <dt>Исходный файл</dt>
                <dd>{source.relativePath}</dd>
              </div>
            </dl>
            <div className={styles.notice}>
              Ссылка на источник позволяет проверить основание. Она не означает
              утверждение клинического правила или разрешение автоматически
              применять рекомендации.
            </div>
            <div className={styles.row}>
              <a
                className={styles.link}
                href={source.officialUrl}
                target="_blank"
                rel="noreferrer"
              >
                Официальный ресурс / первоисточник{" "}
                <Icon name="external" size={14} />
              </a>
              {server && (
                <a
                  className={styles.link}
                  href={`/api/sources/${source.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть исходный документ <Icon name="file" size={14} />
                </a>
              )}
            </div>
            {!server && (
              <p className={styles.subtext}>
                Исходные файлы доступны в серверном режиме, если администратор
                подключил каталог документов. В учебном режиме сохранены
                названия, версии и точные локаторы.
              </p>
            )}
            <details className={styles.details}>
              <summary>Контрольная сумма исходного файла</summary>
              <code>{source.sha256}</code>
            </details>
          </div>
        )}
      </Modal>
    </SourceContext.Provider>
  );
}
export function SourceLinks({ ids }: { ids: readonly string[] }) {
  const open = useContext(SourceContext);
  if (!ids.some((id) => sourceById(id))) return null;
  return (
    <div className={styles.sourceLinks}>
      <Icon name="book" size={13} />
      {ids.map((id) => {
        const source = sourceById(id);
        return source ? (
          <button
            type="button"
            className={styles.sourceLink}
            key={id}
            onClick={() => open(id)}
            title={source.title}
          >
            {id} ·{" "}
            {source.title.length > 58
              ? `${source.title.slice(0, 55)}…`
              : source.title}
          </button>
        ) : null;
      })}
    </div>
  );
}
export function SourceLibrary() {
  const open = useContext(SourceContext);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const filtered = sources.filter(
    (s) =>
      (category === "all" || s.category === category) &&
      `${s.title} ${s.id} ${s.relativePath}`
        .toLocaleLowerCase("ru")
        .includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>Проверяемые основания</div>
          <h1>Библиотека источников</h1>
          <p>38 документов · редакции, применимость и точные ссылки</p>
        </div>
        <Badge tone="amber">Клиническое утверждение отдельно</Badge>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Icon name="search" size={17} />
          <input
            aria-label="Найти источник"
            placeholder="Название, номер приказа или шкала"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.segmented}>
          {[
            ["all", "Все"],
            ["guideline", "Рекомендации"],
            ["regulation", "Нормативные акты"],
            ["scale", "Шкалы"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={category === id}
              onClick={() => setCategory(id!)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.sourceGrid}>
        {filtered.map((source) => (
          <article className={styles.sourceCard} key={source.id}>
            <div className={styles.between}>
              <span className={styles.subtext}>{source.id}</span>
              <Badge
                tone={source.activation === "historical" ? "red" : "neutral"}
              >
                {source.activation === "historical"
                  ? "Исторический"
                  : source.category === "guideline"
                    ? "Клинические рекомендации"
                    : source.category === "scale"
                      ? "Инструмент оценки"
                      : "Нормативный акт"}
              </Badge>
            </div>
            <h3>{source.title}</h3>
            <p>{source.edition}</p>
            <p>{source.status}</p>
            <div className={styles.sourceActions}>
              <Button
                variant="ghost"
                icon="book"
                onClick={() => open(source.id)}
              >
                Открыть паспорт
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <Empty title="Источник не найден" icon="book">
          Попробуйте название заболевания, шкалы или номер документа.
        </Empty>
      )}
    </>
  );
}
export function SourcePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const matches = sources.filter((s) =>
    `${s.title} ${s.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <details className={styles.details}>
      <summary>
        Источники решения{value.length ? ` · ${value.length}` : ""}
      </summary>
      <div className={styles.smallStack}>
        <Field
          label="Поиск источника"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div
          className={styles.smallStack}
          style={{ maxHeight: 200, overflow: "auto" }}
        >
          {matches.map((s) => (
            <label key={s.id} className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={value.includes(s.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, s.id]
                      : value.filter((id) => id !== s.id),
                  )
                }
              />
              <span>
                {s.id} · {s.title}
                {s.activation === "historical" && (
                  <small className={styles.errorText}>
                    {" "}
                    · исторический источник
                  </small>
                )}
              </span>
            </label>
          ))}
        </div>
        <SourceLinks ids={value} />
      </div>
    </details>
  );
}
