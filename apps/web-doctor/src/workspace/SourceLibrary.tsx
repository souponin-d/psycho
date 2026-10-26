import { createContext, useContext, useState, type ReactNode } from "react";
import { sources, sourceById } from "./sources";
import { SourceReader } from "./SourceReader";
import readerStyles from "./SourceReader.module.css";
import { Badge, Empty, Field, Icon, Modal, styles } from "./ui/Elements";
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
            {source.activation === "historical" && (
              <Badge tone="red">Исторический документ</Badge>
            )}
            <dl className={styles.facts}>
              <div>
                <dt>Редакция</dt>
                <dd>{source.edition}</dd>
              </div>
            </dl>
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
            <details className={styles.details}>
              <summary>Сведения об источнике</summary>
              <p>{source.status}</p>
              <p>{source.locator}</p>
            </details>
            {server && /\.md$/i.test(source.relativePath) && (
              <SourceReader key={source.id} id={source.id} />
            )}
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
      s.activation !== "historical" &&
      (category === "all" || s.category === category) &&
      `${s.title} ${s.id} ${s.relativePath}`
        .toLocaleLowerCase("ru")
        .includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>Библиотека</h1>
        </div>
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
          <button
            type="button"
            className={`${styles.sourceCard} ${readerStyles.card}`}
            key={source.id}
            onClick={() => open(source.id)}
            aria-label={`${source.id} · ${source.title}`}
          >
            <span className={styles.between}>
              <span className={styles.subtext}>{source.id}</span>
              <Badge tone="neutral">
                {source.category === "guideline"
                  ? "Клинические рекомендации"
                  : source.category === "scale"
                    ? "Инструмент оценки"
                    : "Нормативный акт"}
              </Badge>
            </span>
            <span className={readerStyles.title}>{source.title}</span>
            <span className={readerStyles.edition}>{source.edition}</span>
          </button>
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
  const matches = sources.filter(
    (s) =>
      (s.activation !== "historical" || value.includes(s.id)) &&
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
