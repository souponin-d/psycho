import { useMemo, useRef, useState } from "react";
import { analyseClinic } from "./aggregate";
import { Bars, Heatmap, MiniLine, TrendChart, number, percent } from "./Charts";
import { Filters } from "./Filters";
import { Drilldown, type Selection } from "./Drilldown";
import { MedicalStats } from "./MedicalStats";
import { Reports } from "./Reports";
import type { ClinicController } from "./useClinicSession";
import type { ClinicDataset } from "./model";
import { dateLabel } from "./model";
import styles from "./analytics.module.css";

export function AnalyticsDashboard({
  data,
  controller,
  section,
}: {
  data: ClinicDataset;
  controller: ClinicController;
  section: string;
}) {
  const result = useMemo(
    () => analyseClinic(data, controller.state.filter),
    [data, controller.state.filter],
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const open = (item: Selection) => {
    previousFocus.current = document.activeElement as HTMLElement;
    setSelection(item);
  };
  const close = () => {
    setSelection(null);
    requestAnimationFrame(() => previousFocus.current?.focus());
  };
  const previous = result.previous;
  const compare = (current: number, before: number | undefined) =>
    before === undefined
      ? "Сравнение недоступно: нет полного прошлого периода"
      : `Ранее ${number(before)} · изменение ${current - before > 0 ? "+" : ""}${number(current - before)}`;
  const facts = [
    {
      label: "Известные самоотчёты",
      value: number(result.summary.reports),
      caption: compare(result.summary.reports, previous?.reports),
      kind: "reports" as const,
      color: "var(--analytics-blue)",
      values: result.daily.map((r) => (r.available ? r.reports : null)),
    },
    {
      label: "На сопровождении",
      value: number(result.summary.patients),
      caption: "Уникальные активные пациенты на конец периода",
      kind: "patients" as const,
      color: "var(--analytics-green)",
      values: result.daily.map(
        (r) =>
          result.selected.patients.filter(
            (p) => p.enrolled <= r.day && (!p.closed || p.closed > r.day),
          ).length,
      ),
    },
    {
      label: "Завершённые приёмы",
      value: number(result.summary.visits),
      caption: compare(result.summary.visits, previous?.visits),
      kind: "visits" as const,
      color: "var(--analytics-purple)",
      values: result.daily.map((r) => r.visits),
    },
    {
      label: "Открытые запросы",
      value: number(result.summary.openSignals),
      caption: "Созданы в периоде, ещё не закрыты. Не клинический риск",
      kind: "signals" as const,
      color: "var(--analytics-amber)",
      values: result.daily.map(
        (r) =>
          result.selected.signals.filter(
            (s) => s.day <= r.day && s.status !== "closed",
          ).length,
      ),
    },
  ];
  const completed = result.selected.signals.filter(
    (s) => s.status === "closed",
  ).length;
  const accepted = result.selected.signals.filter(
    (s) => s.status === "accepted",
  ).length;
  const unaccepted = result.selected.signals.filter(
    (s) => s.status === "open",
  ).length;
  const minutes = result.selected.signals
    .filter((s) => s.acceptedAt)
    .map((s) => (Date.parse(s.acceptedAt!) - Date.parse(s.createdAt)) / 60000)
    .sort((a, b) => a - b);
  const median = minutes.length
    ? minutes.length % 2
      ? minutes[Math.floor(minutes.length / 2)]!
      : (minutes[minutes.length / 2 - 1]! + minutes[minutes.length / 2]!) / 2
    : null;
  return (
    <div className={styles.root}>
      <Filters
        data={data}
        filter={controller.state.filter}
        onChange={controller.setFilter}
      />
      {section === "report" ? (
        <Reports data={data} result={result} />
      ) : section === "medical" ? (
        <MedicalStats data={data} result={result} />
      ) : (
        <>
          {!data.patients.length && (
            <div className={styles.empty}>
              <h2>В клинике пока нет пациентов</h2>
              <p>
                Нулевой состав и отсутствие ожидаемых форм не превращаются в 0%
                выполнения. Выберите набор «Клиника · 180 дней» для полного
                показа.
              </p>
            </div>
          )}
          {data.patients.length > 0 && !result.selected.patients.length && (
            <p className={styles.empty}>
              Для выбранных фильтров нет записей. Измените диапазон или сбросьте
              фильтры.
            </p>
          )}
          <section
            className={styles.metrics}
            aria-label="Показатели клиники"
            tabIndex={0}
          >
            {facts.map((item, index) => (
              <article
                className={index === 0 ? styles.primaryMetric : styles.metric}
                aria-label={item.label}
                key={item.label}
              >
                <button
                  className={styles.metricBody}
                  onClick={() => open({ kind: item.kind })}
                  aria-label={`Открыть состав: ${item.label}`}
                >
                  <span>{item.label}</span>
                  <div className={styles.metricValue}>
                    <strong>{item.value}</strong>
                    <MiniLine values={item.values} color={item.color} />
                  </div>
                  <p>{item.caption}</p>
                  <small>
                    Состав показателя <span aria-hidden="true">↗</span>
                  </small>
                </button>
              </article>
            ))}
          </section>
          {section === "overview" && (
            <>
              <div className={styles.heroGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <h2>Активность сопровождения</h2>
                      <p className={styles.muted}>
                        Известные самоотчёты, шт. · одинаковая длина периодов
                      </p>
                    </div>
                    <span className={styles.contextNumber}>
                      {number(result.summary.reports)} <small>записей</small>
                    </span>
                  </div>
                  <TrendChart
                    key={result.filter.from + result.filter.to}
                    rows={result.daily}
                    onDay={(day) => open({ kind: "reports", day })}
                  />
                  {result.summary.missingDays > 0 && (
                    <p className={styles.warning}>
                      Нет сводки:{" "}
                      {result.selected.missingDays.map(dateLabel).join(", ")}.
                      Итог содержит только известные записи.
                    </p>
                  )}
                  {!previous && (
                    <p className={styles.muted}>
                      Предыдущий период выходит за пределы подготовленной
                      истории и не показан.
                    </p>
                  )}
                </section>
                <section className={styles.focusPanel}>
                  <span className={styles.kicker}>Фокус руководителя</span>
                  <h2>Что требует внимания</h2>
                  <div className={styles.focusFact}>
                    <strong>{unaccepted}</strong>
                    <div>
                      запросов ожидают принятия
                      <small>Осталось пройти явную обработку</small>
                    </div>
                  </div>
                  <div className={styles.focusFact}>
                    <strong>{result.summary.missingDays}</strong>
                    <div>
                      дней без сводки
                      <small>Отсутствие данных не равно нулю</small>
                    </div>
                  </div>
                  <div className={styles.focusFact}>
                    <strong>{percent(result.summary.completion)}</strong>
                    <div>
                      ожидаемых форм получено
                      <small>
                        {result.summary.reports} / {result.summary.expected} в
                        доступные дни
                      </small>
                    </div>
                  </div>
                  <a href="#/director/quality">Разобрать сигналы и качество</a>
                  <p className={styles.footnote}>
                    Выполнение форм — активность взаимодействия. Оно не
                    оценивает лечение или работу врача.
                  </p>
                </section>
              </div>
              <div className={styles.equalColumns}>
                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <h2>Самоотчёты по врачам</h2>
                    <a href="#/director/load">Вся команда</a>
                  </div>
                  <Bars
                    label="Распределение самоотчётов по врачам"
                    rows={[...result.byDoctor]
                      .sort((a, b) => b.reports - a.reports)
                      .slice(0, 5)
                      .map((d) => ({
                        id: d.doctorId,
                        label: d.name,
                        value: d.reports,
                        secondary: `Пациентов в выборке: ${d.patients}`,
                      }))}
                    onSelect={(doctorId) => open({ kind: "reports", doctorId })}
                  />
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <h2>Получение ожидаемых форм</h2>
                    <span className={styles.contextNumber}>
                      {percent(result.summary.completion)}
                    </span>
                  </div>
                  <div className={styles.completionTrack}>
                    <div
                      style={{
                        width: `${Math.min(100, (result.summary.completion ?? 0) * 100)}%`,
                      }}
                    />
                  </div>
                  <dl className={styles.definitionList}>
                    <div>
                      <dt>Получено уникальных форм</dt>
                      <dd>{result.summary.reports}</dd>
                    </div>
                    <div>
                      <dt>Ожидалось в доступные дни</dt>
                      <dd>{result.summary.expected}</dd>
                    </div>
                    <div>
                      <dt>Ожидалось за весь период</dt>
                      <dd>{result.summary.expectedAll}</dd>
                    </div>
                    <div>
                      <dt>Пациентов в выборке</dt>
                      <dd>{result.selected.patients.length}</dd>
                    </div>
                  </dl>
                  <p className={styles.footnote}>
                    Знаменатель учитывает назначенные окна. Дни с отсутствующей
                    сводкой исключены. Одно событие учитывается один раз. Это не
                    процент пациентов, принявших препарат.
                  </p>
                  <a href="#/director/medical">
                    Перейти к описательной медстатистике
                  </a>
                </section>
              </div>
            </>
          )}
          {section === "load" && (
            <>
              <div className={styles.equalColumns}>
                <section className={styles.panel}>
                  <h2>Завершённые приёмы по врачам</h2>
                  <p className={styles.muted}>
                    Отмены и неявки исключены. Число приёмов не является
                    рейтингом качества.
                  </p>
                  <Bars
                    label="Приёмы команды"
                    color="var(--analytics-purple)"
                    rows={result.byDoctor.map((d) => ({
                      id: d.doctorId,
                      label: d.name,
                      value: d.visits,
                      secondary: `Пациентов в выборке: ${d.patients}`,
                    }))}
                    onSelect={(doctorId) => open({ kind: "visits", doctorId })}
                  />
                </section>
                <section className={styles.panel}>
                  <h2>Ритм работы клиники</h2>
                  <Heatmap result={result} />
                  <p className={styles.footnote}>
                    Интенсивность цвета показывает количество. Каждая ячейка
                    подписана числом; календарная ёмкость и часы занятости этим
                    графиком не измеряются.
                  </p>
                  <div className={styles.proofStrip}>
                    <span>
                      <strong>
                        {
                          result.selected.visits.filter(
                            (v) => v.status === "cancelled",
                          ).length
                        }
                      </strong>{" "}
                      отмен
                    </span>
                    <span>
                      <strong>
                        {
                          result.selected.visits.filter(
                            (v) => v.status === "missed",
                          ).length
                        }
                      </strong>{" "}
                      неявок
                    </span>
                  </div>
                </section>
              </div>
              <section className={styles.panel}>
                <h2>Состав командной сводки</h2>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Врач</th>
                        <th>Пациенты</th>
                        <th>Самоотчёты</th>
                        <th>Приёмы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.byDoctor.map((d) => (
                        <tr key={d.doctorId}>
                          <th scope="row">
                            <button
                              onClick={() =>
                                open({ kind: "visits", doctorId: d.doctorId })
                              }
                            >
                              {d.name}
                            </button>
                          </th>
                          <td>{d.patients}</td>
                          <td>{d.reports}</td>
                          <td>{d.visits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {section === "quality" && (
            <>
              <div className={styles.equalColumns}>
                <section className={styles.panel}>
                  <h2>Обработка запросов на связь</h2>
                  <Bars
                    color="var(--analytics-amber)"
                    label="Стадии организационных сигналов"
                    rows={[
                      {
                        id: "open",
                        label: "Ожидают принятия",
                        value: unaccepted,
                      },
                      {
                        id: "accepted",
                        label: "Приняты, ждут ответа",
                        value: accepted,
                      },
                      {
                        id: "closed",
                        label: "Ответ подтверждён",
                        value: completed,
                      },
                    ]}
                  />
                  <dl className={styles.definitionList}>
                    <div>
                      <dt>Медиана до принятия</dt>
                      <dd>
                        {median === null
                          ? "Нет данных"
                          : `${number(median)} мин`}
                      </dd>
                    </div>
                    <div>
                      <dt>N событий с временем принятия</dt>
                      <dd>{minutes.length}</dd>
                    </div>
                  </dl>
                  <p className={styles.footnote}>
                    Учебные организационные события. Это не экстренный алертинг
                    и не клинический риск.
                  </p>
                </section>
                <section className={styles.panel}>
                  <h2>Качество и происхождение</h2>
                  <dl className={styles.definitionList}>
                    <div>
                      <dt>Дни без сводки</dt>
                      <dd>{result.summary.missingDays}</dd>
                    </div>
                    <div>
                      <dt>Известные самоотчёты</dt>
                      <dd>{result.summary.reports}</dd>
                    </div>
                    <div>
                      <dt>Сопоставимые пары PHQ-9</dt>
                      <dd>{result.clinical.pairs}</dd>
                    </div>
                    <div>
                      <dt>Без сопоставимой пары</dt>
                      <dd>{result.clinical.excluded}</dd>
                    </div>
                  </dl>
                  <p className={styles.warning}>
                    {result.selected.missingDays.length
                      ? `Нет сводки: ${result.selected.missingDays.map(dateLabel).join(", ")}`
                      : "В выбранном диапазоне нет отмеченных пропусков дневной сводки."}
                  </p>
                  <p className={styles.footnote}>
                    Нулевое значение отличается от отсутствующего. Сырые данные
                    — синтетические; агрегаты вычислены из событий текущей
                    выборки. Дубли по ID/окну формы не принимаются.
                  </p>
                </section>
              </div>
              <section className={styles.panel}>
                <h2>События выбранного периода</h2>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Учебная запись</th>
                        <th>Событие</th>
                        <th>Стадия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.selected.signals.map((signal) => (
                        <tr key={signal.id}>
                          <td>{dateLabel(signal.day)}</td>
                          <th scope="row">
                            {
                              data.patients.find(
                                (p) => p.id === signal.patientId,
                              )?.name
                            }
                          </th>
                          <td>{signal.title}</td>
                          <td>
                            {signal.status === "open"
                              ? "Ожидает принятия"
                              : signal.status === "accepted"
                                ? "Принято"
                                : "Ответ подтверждён"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
      <Drilldown
        key={selection ? JSON.stringify(selection) : "closed"}
        selection={selection}
        result={result}
        data={data}
        onClose={close}
      />
    </div>
  );
}
