import { useEffect, useMemo, useState } from "react";
import { grlsCatalog, type MedicineSelection } from "./grls";
import { grlsSource, loadGrlsCatalog } from "./grls-loader";
import { Button, Field, styles } from "./ui/Elements";

export function MedicineSummary({ value }: { value: MedicineSelection }) {
  return (
    <div className={styles.inlineNote}>
      <p>
        <strong>{value.tradeName}</strong> · {value.inn || "МНН не указано"}
      </p>
      <p>
        РУ {value.registrationNumber} · {value.registrationStatus}
      </p>
      <p className={styles.subtext}>
        Снимок {value.sourceVersion}; окончание регистрации:{" "}
        {value.expiresOn || "дата не указана"}
        {value.cancelledOn ? `; аннулирование: ${value.cancelledOn}` : ""}
      </p>
      <details className={styles.details}>
        <summary>Формы выпуска и производитель на момент выбора</summary>
        <p>{value.forms || "Форма не указана"}</p>
        <p>{value.manufacturers || value.holder}</p>
      </details>
    </div>
  );
}
export function MedicinePicker({
  value,
  onChange,
}: {
  value?: MedicineSelection | null;
  onChange: (value: MedicineSelection | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(grlsCatalog.ready);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      await loadGrlsCatalog();
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ГРЛС недоступен.");
    }
  }
  useEffect(() => {
    let active = true;
    loadGrlsCatalog()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "ГРЛС недоступен.");
      });
    return () => {
      active = false;
    };
  }, []);
  const result = useMemo(
    () => (ready ? grlsCatalog.search(query, page, 12) : null),
    [ready, query, page],
  );
  return (
    <div className={styles.form}>
      <Field
        label="Поиск препарата в ГРЛС"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        maxLength={250}
        hint={`Актуальные регистрации · снимок ${grlsSource.snapshotDate}. Поиск по МНН, названию, форме, производителю или РУ.`}
      />
      {!ready && !error && <p role="status">Загрузка полного справочника…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Повторить загрузку ГРЛС
          </Button>
        </div>
      )}
      {ready && query.trim() && result && (
        <div
          className={styles.inlineNote}
          role="group"
          aria-label="Результаты поиска препаратов"
        >
          <p role="status">
            {result.total
              ? `${(page - 1) * 12 + 1}–${Math.min(page * 12, result.total)} из ${result.total}`
              : "Актуальных препаратов не найдено"}
          </p>
          {result.items.map((item) => (
            <div className={styles.stack} key={item.recordId}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onChange(item);
                  setQuery("");
                  setPage(1);
                }}
              >
                {item.tradeName} · {item.inn || "МНН не указано"} · РУ{" "}
                {item.registrationNumber}
              </Button>
              <small>
                {item.registrationStatus} · {item.holder}
              </small>
              <small>
                {item.forms.slice(0, 240)}
                {item.forms.length > 240 ? "…" : ""}
              </small>
            </div>
          ))}
          {result.total > 12 && (
            <div className={styles.row}>
              <Button
                type="button"
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Предыдущие препараты
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page * 12 >= result.total}
                onClick={() => setPage(page + 1)}
              >
                Следующие препараты
              </Button>
            </div>
          )}
        </div>
      )}
      {value && (
        <>
          <MedicineSummary value={value} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => onChange(null)}
          >
            Изменить выбранный препарат
          </Button>
        </>
      )}
    </div>
  );
}
