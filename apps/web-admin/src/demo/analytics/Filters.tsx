import { useEffect, useState, useRef, useId } from "react";
import { z } from "zod";
import { Button } from "@psycho/ui-web";
import { DATA_START, DEMO_DAY, groups } from "./fixtures";
import { addDays, dateLabel } from "./model";
import type { ClinicDataset, ClinicFilter } from "./model";
import styles from "./analytics.module.css";
export function Filters({
  data,
  filter,
  onChange,
}: {
  data: ClinicDataset;
  filter: ClinicFilter;
  onChange: (patch: Partial<ClinicFilter>) => void;
}) {
  const firstDate = useRef<HTMLInputElement>(null);
  const advancedId = useId();
  const [advanced, setAdvanced] = useState(false);
  const filterCount = [
    filter.departmentId,
    filter.doctorId,
    filter.group,
  ].filter((value) => value !== "all").length;
  const [from, setFrom] = useState(filter.from),
    [to, setTo] = useState(filter.to),
    [error, setError] = useState(""),
    [custom, setCustom] = useState(false);
  useEffect(() => {
    setFrom(filter.from);
    setTo(filter.to);
    setError("");
  }, [filter.from, filter.to]);
  const duration =
    Math.round((Date.parse(filter.to) - Date.parse(filter.from)) / 86400000) +
    1;
  const preset =
    filter.to === DEMO_DAY && [7, 30, 90, 180].includes(duration)
      ? String(duration)
      : "custom";
  return (
    <section className={styles.filters} aria-label="Фильтры аналитики">
      <div className={styles.filterRow}>
        <label>
          Период анализа
          <select
            value={preset}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (value === "custom") setCustom(true);
              else {
                setCustom(false);
                onChange({
                  from: addDays(DEMO_DAY, 1 - Number(value)),
                  to: DEMO_DAY,
                });
              }
            }}
          >
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
            <option value="180">180 дней</option>
            <option value="custom">Свой диапазон</option>
          </select>
        </label>
        <button
          className={styles.mobileFilterToggle}
          aria-expanded={advanced}
          aria-controls={advancedId}
          onClick={() => setAdvanced(!advanced)}
        >
          Фильтры{filterCount ? ` · ${filterCount}` : ""}
        </button>
        <div
          className={styles.advancedFilters}
          id={advancedId}
          data-open={advanced}
        >
          <label>
            Отделение
            <select
              value={filter.departmentId}
              onChange={(e) =>
                onChange({ departmentId: e.currentTarget.value })
              }
            >
              <option value="all">Все отделения</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Врач
            <select
              value={filter.doctorId}
              onChange={(e) => onChange({ doctorId: e.currentTarget.value })}
            >
              <option value="all">Все врачи</option>
              {data.doctors
                .filter(
                  (d) =>
                    filter.departmentId === "all" ||
                    d.departmentId === filter.departmentId,
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Группа наблюдения
            <select
              value={filter.group}
              onChange={(e) => onChange({ group: e.currentTarget.value })}
            >
              <option value="all">Все группы</option>
              {groups.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className={styles.filterCaption}>
        <span>
          {dateLabel(filter.from)} – {dateLabel(filter.to)} 2026 · фиксированные
          часы демо
        </span>
        <button
          onClick={() => {
            setCustom(!custom);
            setError("");
          }}
          aria-expanded={custom}
        >
          Указать даты
        </button>
        {(filter.departmentId !== "all" ||
          filter.doctorId !== "all" ||
          filter.group !== "all" ||
          preset !== "30") && (
          <button
            onClick={() => {
              setCustom(false);
              onChange({
                from: addDays(DEMO_DAY, -29),
                to: DEMO_DAY,
                departmentId: "all",
                doctorId: "all",
                group: "all",
              });
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>
      {custom && (
        <form
          className={styles.dateForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !z.iso.date().safeParse(from).success ||
              !z.iso.date().safeParse(to).success ||
              from < DATA_START ||
              to > DEMO_DAY ||
              from > to
            ) {
              setError(
                `Укажите даты от ${dateLabel(DATA_START)} до ${dateLabel(DEMO_DAY)}; начало не позже окончания.`,
              );
              firstDate.current?.focus();
              return;
            }
            onChange({ from, to });
            setError("");
          }}
          noValidate
        >
          <label>
            Дата начала
            <input
              ref={firstDate}
              type="date"
              min={DATA_START}
              max={to || DEMO_DAY}
              value={from}
              onChange={(e) => setFrom(e.currentTarget.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "date-error" : undefined}
            />
          </label>
          <label>
            Дата окончания
            <input
              type="date"
              min={from || DATA_START}
              max={DEMO_DAY}
              value={to}
              onChange={(e) => setTo(e.currentTarget.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "date-error" : undefined}
            />
          </label>
          <Button type="submit">Применить даты</Button>
          {error && (
            <p id="date-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
