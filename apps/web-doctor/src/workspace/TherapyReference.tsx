import { supportCatalog } from "./clinical-support-engine";
import { styles } from "./ui/Elements";
export function TherapyReference() {
  const sources = supportCatalog.sources.filter((s) =>
    ["gad-ru", "depression-ru", "gad-nice", "depression-nice"].includes(s.id),
  );
  return (
    <details className={styles.details}>
      <summary>Источники вариантов терапии · ГТР и депрессия</summary>
      <p className={styles.subtext}>
        Сравнение вариантов и индивидуальные ограничения доступны в клинической
        поддержке карты.
      </p>
      <div className={styles.smallStack}>
        {sources.map((s) => (
          <article key={s.id} className={styles.inlineNote}>
            <h3>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            </h3>
            <p>
              {s.version} · {s.section}
            </p>
            <p className={styles.subtext}>{s.limitation}</p>
          </article>
        ))}
      </div>
    </details>
  );
}
