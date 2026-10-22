import { useMemo, useState } from "react";
import { clinicalSummary, type ClinicAnalysis } from "./aggregate";
import type { ClinicDataset, Scale } from "./model";
import { Bars, number } from "./Charts";
import styles from "./analytics.module.css";
export function MedicalStats({
  data,
  result,
}: {
  data: ClinicDataset;
  result: ClinicAnalysis;
}) {
  const [scale, setScale] = useState<Scale>("PHQ-9");
  const summary = useMemo(
    () =>
      clinicalSummary(
        data.observations,
        result.selected.patients.map((p) => p.id),
        result.filter,
        scale,
      ),
    [data.observations, result, scale],
  );
  const maximum = scale === "PHQ-9" ? 27 : 21,
    width = Math.ceil((maximum + 1) / 5);
  const bins = Array.from({ length: 5 }, (_, i) => ({
    id: `bin-${i}`,
    label: `${i * width}–${Math.min(maximum, (i + 1) * width - 1)} баллов`,
    value: summary.latest.filter(
      (o) => o.value >= i * width && o.value <= (i + 1) * width - 1,
    ).length,
  }));
  return (
    <div className={styles.stack}>
      <div className={styles.notice}>
        <strong>Описательная медицинская статистика</strong>
        <p>
          Синтетические внешние результаты оценки. Приложение не проводит
          тестирование, не определяет диагноз и не оценивает эффективность
          лечения.
        </p>
      </div>
      <div className={styles.panelHeading}>
        <div>
          <h2>Наблюдения, а не выводы о лечении</h2>
          <p className={styles.muted}>
            Версия: synthetic-external-2026-10 · единица: баллы
          </p>
        </div>
        <label className={styles.field}>
          Инструмент оценки
          <select
            value={scale}
            onChange={(e) => setScale(e.currentTarget.value as Scale)}
          >
            <option>PHQ-9</option>
            <option>GAD-7</option>
          </select>
        </label>
      </div>
      <div className={styles.clinicalMetrics}>
        <article>
          <span>Пациенты с оценкой в периоде</span>
          <strong>{summary.latest.length}</strong>
          <small>Из {result.selected.patients.length} пациентов выборки</small>
        </article>
        <article>
          <span>Сопоставимые пары</span>
          <strong>{summary.pairs}</strong>
          <small>Один инструмент и одна версия</small>
        </article>
        <article>
          <span>Медиана изменения</span>
          <strong>
            {summary.change === null
              ? "Нет данных"
              : `${summary.change > 0 ? "+" : ""}${number(summary.change)}`}
          </strong>
          <small>
            {summary.pairs} пар · исключено {summary.excluded}
          </small>
        </article>
      </div>
      <div className={styles.equalColumns}>
        <section className={styles.panel}>
          <h2>Распределение последних оценок</h2>
          <p className={styles.muted}>
            N = {summary.latest.length}, по одному наблюдению на пациента в
            периоде
          </p>
          <Bars
            rows={bins}
            label="Распределение результатов оценки"
            color="var(--analytics-purple)"
          />
          <p className={styles.footnote}>
            Интервалы выбраны для графика. Это не категории клинической тяжести.
          </p>
        </section>
        <section className={styles.panel}>
          <h2>Та же выборка, два измерения</h2>
          {summary.pairs ? (
            <>
              <div className={styles.paired}>
                <div>
                  <span>Исходное</span>
                  <strong>{number(summary.baseline!)}</strong>
                </div>
                <span aria-hidden="true">→</span>
                <div>
                  <span>Повторное</span>
                  <strong>{number(summary.followup!)}</strong>
                </div>
              </div>
              <p>Медианы для {summary.pairs} одних и тех же пациентов.</p>
            </>
          ) : (
            <p className={styles.empty}>
              Недостаточно сопоставимых повторных измерений.
            </p>
          )}
          <p className={styles.footnote}>
            Исходное — первое доступное измерение до конца периода. Повторное —
            последнее в выбранном периоде, позже исходного, той же версии.
            Изменение — медиана индивидуальных разностей. Эти числа не
            доказывают эффект терапии.
          </p>
        </section>
      </div>
      <div className={styles.equalColumns}>
        <section className={styles.panel}>
          <h2>Возрастные группы</h2>
          <Bars
            label="Возрастной состав выборки"
            rows={["18–29", "30–44", "45–59", "60+"].map((age) => ({
              id: age,
              label: age,
              value: result.selected.patients.filter((p) => p.ageBand === age)
                .length,
            }))}
          />
        </section>
        <section className={styles.panel}>
          <h2>Группы наблюдения</h2>
          <Bars
            label="Состав групп наблюдения"
            color="var(--analytics-green)"
            rows={[
              "Тревожная симптоматика",
              "Депрессивная симптоматика",
              "Смешанная симптоматика",
            ].map((group) => ({
              id: group,
              label: group,
              value: result.selected.patients.filter((p) => p.group === group)
                .length,
            }))}
          />
          <p className={styles.footnote}>
            Учебные группы заданы в данных. Это не автоматически рассчитанные
            диагнозы.
          </p>
        </section>
      </div>
      <details className={styles.panel}>
        <summary>Методика и состав сопоставимых пар</summary>
        <p className={styles.footnote}>
          Несовпадающая версия, единственное измерение и отсутствие повторного
          результата исключаются. Самоотчёты настроения не суммируются с баллами
          PHQ-9/GAD-7.
        </p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Учебная запись</th>
                <th>Исходное</th>
                <th>Повторное</th>
                <th>Разность</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.patientId}>
                  <th scope="row">
                    {data.patients.find((p) => p.id === row.patientId)?.name}
                  </th>
                  <td>{row.baseline}</td>
                  <td>{row.followup}</td>
                  <td>
                    {row.change > 0 ? "+" : ""}
                    {row.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
