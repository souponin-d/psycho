import { Button } from "@psycho/ui-web";
import { csvReport, type ClinicAnalysis } from "./aggregate";
import { dateLabel } from "./model";
import type { ClinicDataset } from "./model";
import { number, percent, TrendChart } from "./Charts";
import styles from "./analytics.module.css";
export function Reports({
  data,
  result,
}: {
  data: ClinicDataset;
  result: ClinicAnalysis;
}) {
  function download() {
    const blob = new Blob([csvReport(data, result.filter, result)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `syncli-demo-${result.filter.from}-${result.filter.to}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={styles.stack}>
      <div className={styles.panelHeading}>
        <p className={styles.muted}>
          Отчёт использует текущий период и все активные фильтры.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={download}>
            Скачать CSV
          </Button>
          <Button onClick={() => window.print()}>Печать / сохранить PDF</Button>
        </div>
      </div>
      <article className={`${styles.report} ${styles.printable}`}>
        <header>
          <span className={styles.kicker}>Синкли · управленческая сводка</span>
          <h2>Сопровождение пациентов</h2>
          <p>
            {dateLabel(result.filter.from)} – {dateLabel(result.filter.to)} 2026
          </p>
          <p>
            {data.departments.find((d) => d.id === result.filter.departmentId)
              ?.name ?? "Все отделения"}{" "}
            ·{" "}
            {data.doctors.find((d) => d.id === result.filter.doctorId)?.name ??
              "Все врачи"}{" "}
            ·{" "}
            {result.filter.group === "all" ? "Все группы" : result.filter.group}
          </p>
          <strong>Синтетические данные. Не клиническое заключение.</strong>
        </header>
        <div className={styles.proofStrip}>
          <span>
            <strong>{result.summary.patients}</strong> на сопровождении
          </span>
          <span>
            <strong>{number(result.summary.reports)}</strong> известных
            самоотчётов
          </span>
          <span>
            <strong>{percent(result.summary.completion)}</strong> ожидаемых форм
            получено
          </span>
        </div>
        <h3>Динамика известных самоотчётов</h3>
        <TrendChart
          key={`${result.filter.from}:${result.filter.to}`}
          rows={result.daily}
        />
        <h3>Состав и полнота</h3>
        <p>
          Пациентов в выборке: {result.selected.patients.length}. Ожидалось форм
          в доступные дни: {result.summary.expected}; получено{" "}
          {result.summary.reports}. Дней без сводки:{" "}
          {result.summary.missingDays}. Пропуски не равны нулевой активности.
          Источник: воспроизводимый набор клиники и события этого учебного
          сеанса.
        </p>
        <h3>Показатели команды</h3>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Врач</th>
                <th>Пациенты в выборке</th>
                <th>Самоотчёты</th>
                <th>Завершённые приёмы</th>
              </tr>
            </thead>
            <tbody>
              {result.byDoctor.map((row) => (
                <tr key={row.doctorId}>
                  <th scope="row">{row.name}</th>
                  <td>{row.patients}</td>
                  <td>{row.reports}</td>
                  <td>{row.visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Описательные наблюдения</h3>
        <p>
          PHQ-9 · сопоставимых пар: {result.clinical.pairs}; исключено:{" "}
          {result.clinical.excluded}. Медиана индивидуального изменения:{" "}
          {result.clinical.change === null
            ? "Нет данных"
            : number(result.clinical.change)}{" "}
          баллов. Исходное измерение может предшествовать выбранному периоду;
          повторное находится в периоде и относится к той же версии.
          Синтетическая версия: synthetic-external-2026-10.
        </p>
        <h3>Методика и ограничения</h3>
        <p>
          Пациенты на сопровождении — уникальные активные записи на конец
          периода. Выполнение форм — уникальные полученные формы / ожидаемые
          формы в дни с доступными сводками. Отмены и неявки не входят в
          завершённые приёмы. Самоотчёты и баллы внешней оценки не доказывают
          эффективность терапии. Доставка и роли симулируются локально;
          авторизация и реальные медицинские решения отсутствуют.
        </p>
        <footer>
          Часы демо: 20 октября 2026, Москва · Синкли · версия набора 1
        </footer>
      </article>
    </div>
  );
}
