import { useMemo, useState } from "react";
import type { DiagnosisSelection } from "./model";
import { searchIcd10, type TerminologySelection } from "./terminology";
import { Button, Field, styles } from "./ui/Elements";

type Selection = TerminologySelection | DiagnosisSelection;

export function TerminologyPicker<T extends Selection>({
  label,
  value,
  onChange,
  diagnosis = false,
}: {
  label: string;
  value: T[];
  onChange: (value: T[]) => void;
  diagnosis?: boolean;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchIcd10(query).slice(0, 12), [query]);
  const add = (item: TerminologySelection) => {
    if (value.some((current) => current.code === item.code)) return;
    onChange([
      ...value,
      (diagnosis ? { ...item, status: "hypothesis" } : item) as T,
    ]);
  };
  return (
    <div className={styles.form}>
      <Field
        label={label}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        hint="Учебный срез МКБ-10: поиск по коду или названию"
      />
      {query && (
        <div className={styles.inlineNote} role="listbox" aria-label={label}>
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
        </div>
      )}
      {value.map((item) => (
        <div className={styles.between} key={item.code}>
          <span>
            {item.code} · {item.title}
          </span>
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
