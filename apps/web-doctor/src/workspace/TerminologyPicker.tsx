import { useMemo, useState } from "react";
import type { DiagnosisSelection } from "./model";
import {
  ICD10_SOURCE,
  isCurrentIcd10Selection,
  searchIcd10,
  type TerminologySelection,
} from "./terminology";
import { Button, Field, Select, styles } from "./ui/Elements";

type Selection = TerminologySelection | DiagnosisSelection;

export function TerminologyPicker<T extends Selection>({
  label,
  value,
  onChange,
  diagnosis = false,
  canConfirm = false,
  multiple = true,
}: {
  label: string;
  value: T[];
  onChange: (value: T[]) => void;
  diagnosis?: boolean;
  canConfirm?: boolean;
  multiple?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const matches = useMemo(() => searchIcd10(query), [query]);
  const results = matches.slice(page * 12, (page + 1) * 12);
  const add = (item: TerminologySelection) => {
    if (value.some((current) => current.code === item.code)) return;
    onChange([
      ...(multiple ? value : []),
      (diagnosis ? { ...item, status: "hypothesis" } : item) as T,
    ]);
  };
  return (
    <div className={styles.form}>
      <Field
        label={label}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(0);
        }}
        hint={`Полная МКБ-10 · ЕСНСИ ${ICD10_SOURCE.sourceVersion.replace("esnsi-", "")} · поиск по коду, названию, классу или блоку`}
      />
      {query && (
        <div className={styles.inlineNote} role="group" aria-label={label}>
          <p className={styles.subtext} role="status" aria-live="polite">
            {matches.length
              ? `${page * 12 + 1}–${Math.min((page + 1) * 12, matches.length)} из ${matches.length}`
              : "Совпадений не найдено"}
          </p>
          {results.length ? (
            results.map((item) => (
              <Button
                key={item.code}
                type="button"
                variant="secondary"
                onClick={() => add(item)}
              >
                {item.code} · {item.title}
              </Button>
            ))
          ) : (
            <p className={styles.subtext}>Совпадений не найдено</p>
          )}
          {matches.length > 12 && (
            <div className={styles.row}>
              <Button
                type="button"
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Предыдущие результаты
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={(page + 1) * 12 >= matches.length}
                onClick={() => setPage(page + 1)}
              >
                Следующие результаты
              </Button>
            </div>
          )}
        </div>
      )}
      {value.map((item) => (
        <div className={styles.stack} key={item.code}>
          <span>
            {item.code} · {item.title}
          </span>
          {!Boolean(isCurrentIcd10Selection(item)) && (
            <small className={styles.subtext}>
              Историческая запись · {item.sourceVersion}. Для замены выберите
              актуальный код.
            </small>
          )}
          {diagnosis && "status" in item && (
            <Select
              label={`Статус диагноза ${item.code}`}
              value={item.status}
              disabled={!canConfirm}
              onChange={(event) => {
                if (!canConfirm) return;
                const status = event.target
                  .value as DiagnosisSelection["status"];
                onChange(
                  value.map((current) =>
                    current.code === item.code
                      ? { ...current, status }
                      : current,
                  ),
                );
              }}
            >
              <option value="hypothesis">Рабочая гипотеза</option>
              <option value="confirmed">Подтверждён</option>
            </Select>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onChange(value.filter((current) => current.code !== item.code))
            }
          >
            Убрать
          </Button>
        </div>
      ))}
    </div>
  );
}
