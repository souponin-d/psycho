import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Measurement, PatientRecord, ScaleKey } from "./model";
import { scales } from "./sources";
import { SourceLinks } from "./SourceLibrary";
import { AssessmentForms } from "./AssessmentForms";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import { formatDate, localDateTime } from "./labels";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Modal,
  Section,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";

export function MeasurementForm({
  patient,
  actions,
  onClose,
  visitId = "",
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
  visitId?: string;
}) {
  const [scale, setScale] = useState<ScaleKey>("GAD-7");
  const preset = scales.find((s) => s.key === scale)!;
  const [title, setTitle] = useState("GAD-7");
  const [score, setScore] = useState("");
  const [maximum, setMaximum] = useState("21");
  const [when, setWhen] = useState(localDateTime(new Date().toISOString()));
  const [version, setVersion] = useState("");
  const [externalForm, setExternalForm] = useState("");
  const [window, setWindow] = useState("Последние 2 недели");
  const [completeness, setCompleteness] =
    useState<Measurement["completeness"]>("complete");
  const [interpretation, setInterpretation] = useState("");
  const [answers, setAnswers] = useState("");
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const parsed = answers.trim()
        ? answers
            .split(/[;,\s]+/)
            .filter(Boolean)
            .map((a) => (a === "-" ? null : Number(a)))
        : [];
      if (parsed.some((a) => a !== null && !Number.isFinite(a)))
        throw new Error(
          "Ответы: числовые значения через пробел, пропуск — знак «-».",
        );
      await actions.mutate(patient.id, {
        type: "measurement.add",
        value: {
          id: crypto.randomUUID(),
          createdAt: "",
          author: "",
          visitId,
          scale,
          title,
          version,
          measuredAt: new Date(when).toISOString(),
          score:
            completeness === "complete" && score !== "" ? Number(score) : null,
          maximum: maximum !== "" ? Number(maximum) : null,
          answers: parsed,
          completeness,
          assessor: preset.assessor,
          window,
          sourceId: preset.sourceId,
          interpretation,
          provenance: preset.assessor === "patient" ? "patient" : "clinician",
          externalForm,
        },
      });
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  function changeScale(key: ScaleKey) {
    const s = scales.find((x) => x.key === key)!;
    setScale(key);
    setTitle(key === "custom" ? "" : key);
    setMaximum(s.maximum === null ? "" : String(s.maximum));
    setWindow(s.window);
    setScore("");
    setAnswers("");
  }
  return (
    <Modal open onClose={onClose} title="Добавить результат оценки">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Select
          label="Инструмент"
          value={scale}
          onChange={(e) => changeScale(e.target.value as ScaleKey)}
        >
          {scales.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </Select>
        <div className={styles.notice}>
          Регистрация результата из использованной формы. Автоматические ключи и
          клинические пороги не активированы до проверки версии и утверждения.{" "}
          {preset.assessor === "clinician"
            ? "Заполняет врач по результатам экспертной оценки."
            : "Укажите результат самоотчёта пациента и его происхождение."}
        </div>
        {scale === "custom" && (
          <Field
            label="Название инструмента"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        )}
        <Field
          label="Форма и версия"
          placeholder="Название версии, язык, дата редакции"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          required
        />
        <Field
          label="Источник результата"
          placeholder="Бумажный бланк, документ или запись интервью"
          value={externalForm}
          onChange={(e) => setExternalForm(e.target.value)}
          required
        />
        <div className={styles.formPair}>
          <Field
            label="Дата и время оценки"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
          <Select
            label="Полнота"
            value={completeness}
            onChange={(e) =>
              setCompleteness(e.target.value as typeof completeness)
            }
          >
            <option value="complete">Полная оценка</option>
            <option value="partial">Частичная</option>
            <option value="not-assessed">Не удалось оценить</option>
          </Select>
        </div>
        <Field
          label="Временное окно оценки"
          value={window}
          onChange={(e) => setWindow(e.target.value)}
        />
        {completeness === "complete" && scale !== "C-SSRS" && (
          <div className={styles.formPair}>
            <Field
              label="Итоговый балл"
              type="number"
              step="any"
              min={0}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              required
            />
            <Field
              label="Максимум используемой формы"
              type="number"
              step="any"
              min={1}
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
            />
          </div>
        )}
        <details className={styles.details}>
          <summary>Исходные значения пунктов</summary>
          <Field
            label="Ответы по порядку"
            hint="Числа через пробел. Пропуск обозначается «-». Итог не вычисляется автоматически."
            value={answers}
            onChange={(e) => setAnswers(e.target.value)}
          />
        </details>
        <Textarea
          label="Заключение / комментарий врача"
          value={interpretation}
          onChange={(e) => setInterpretation(e.target.value)}
          rows={3}
        />
        {preset.sourceId && <SourceLinks ids={[preset.sourceId]} />}
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy}>
            Сохранить результат
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function seriesKey(m: Measurement) {
  return `${m.scale}|${m.version}|${m.assessor}|${m.maximum}`;
}
export function TrendChart({ values }: { values: Measurement[] }) {
  const points = values
    .filter((m) => m.score !== null && m.completeness === "complete")
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (!points.length)
    return (
      <Empty icon="chart" title="Пока нет полных измерений">
        Добавьте результат оценки. Частичные ответы сохраняются в истории и не
        превращаются в нулевой балл.
      </Empty>
    );
  return <TrendPlot points={points} />;
}
function TrendPlot({ points }: { points: Measurement[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = svg.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(Math.max(220, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = 210,
    left = 42,
    right = 15,
    top = 15,
    bottom = 30;
  const max = Math.max(...points.map((p) => p.maximum ?? p.score ?? 1), 1);
  const dates = points.map((p) => Date.parse(p.measuredAt));
  const minDate = Math.min(...dates),
    maxDate = Math.max(...dates);
  const x = (i: number) =>
    maxDate === minDate
      ? (left + (width - right)) / 2
      : left +
        ((dates[i]! - minDate) / (maxDate - minDate)) * (width - left - right);
  const y = (score: number) =>
    height - bottom - (score / max) * (height - top - bottom);
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score!)}`)
    .join(" ");
  return (
    <div className={styles.chartArea}>
      <svg
        ref={svg}
        className={styles.chart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Динамика ${points[0]!.scale}: ${points.map((p) => `${formatDate(p.measuredAt)} — ${p.score}`).join("; ")}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <g key={r}>
            <line
              x1={left}
              y1={y(max * r)}
              x2={width - right}
              y2={y(max * r)}
              stroke="#e8ede1"
              strokeDasharray="3 5"
            />
            <text x={left - 10} y={y(max * r) + 3} textAnchor="end">
              {Math.round(max * r * 10) / 10}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <>
            <path
              d={`${path} L${x(points.length - 1)},${height - bottom} L${x(0)},${height - bottom}Z`}
              fill="#edf3e6"
            />
            <path
              d={path}
              fill="none"
              stroke="#6a8d53"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {points.map((p, i) => (
          <g key={p.id}>
            <circle
              cx={x(i)}
              cy={y(p.score!)}
              r="4.5"
              fill="#fff"
              stroke="#6a8d53"
              strokeWidth="2.5"
            >
              <title>
                {formatDate(p.measuredAt)}: {p.score}
              </title>
            </circle>
            {(i === 0 ||
              i === points.length - 1 ||
              (points.length < 7 && width > 500)) && (
              <text
                x={x(i)}
                y={height - 7}
                textAnchor={i === points.length - 1 ? "end" : "start"}
              >
                {formatDate(p.measuredAt, { day: "numeric", month: "short" })}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className={styles.chartLegend}>
        <span>
          <i className={styles.dot} />
          {points[0]!.scale} · исходные баллы
        </span>
        <span>Снижение или рост требует клинической оценки</span>
      </div>
    </div>
  );
}
export function Dynamics({
  patient,
  actions,
  compact = false,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  compact?: boolean;
}) {
  const [form, setForm] = useState(false);
  const keys = [...new Set(patient.measurements.map(seriesKey))];
  const [selected, setSelected] = useState("");
  const key = keys.includes(selected) ? selected : (keys[0] ?? "");
  const [period, setPeriod] = useState("all");
  const since = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
  const values = patient.measurements.filter(
    (m) => seriesKey(m) === key && Date.parse(m.measuredAt) >= since,
  );
  const [detail, setDetail] = useState<Measurement | null>(null);
  return (
    <>
      <Section
        title="Динамика состояния"
        description="Сравниваются одна форма, версия, роль оценщика и шкала баллов"
        action={
          <Button
            variant={compact ? "ghost" : "primary"}
            icon="plus"
            onClick={() => setForm(true)}
          >
            Добавить оценку
          </Button>
        }
      >
        {keys.length > 0 && (
          <div className={styles.toolbar}>
            <Select
              label="Ряд измерений"
              value={key}
              onChange={(e) => setSelected(e.target.value)}
            >
              {keys.map((k) => {
                const m = patient.measurements.find((m) => seriesKey(m) === k)!;
                return (
                  <option key={k} value={k}>
                    {m.scale} · {m.version}
                  </option>
                );
              })}
            </Select>
            <Select
              label="Период"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="all">Весь период</option>
              <option value="30">30 дней</option>
              <option value="90">90 дней</option>
              <option value="180">180 дней</option>
            </Select>
          </div>
        )}
        <TrendChart values={values} />
        {!compact && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Оценка</th>
                  <th>Результат</th>
                  <th>Источник</th>
                  <th>Подробнее</th>
                </tr>
              </thead>
              <tbody>
                {values
                  .slice()
                  .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{formatDate(m.measuredAt)}</td>
                      <td>{m.title}</td>
                      <td>
                        {m.score === null ? (
                          <Badge tone="amber">
                            {m.completeness === "partial"
                              ? "Частичная"
                              : "Не оценено"}
                          </Badge>
                        ) : (
                          `${m.score}${m.maximum !== null ? ` / ${m.maximum}` : ""}`
                        )}
                      </td>
                      <td>
                        {m.assessor === "patient"
                          ? "Самоотчёт"
                          : "Экспертная оценка"}
                      </td>
                      <td>
                        <Button variant="ghost" onClick={() => setDetail(m)}>
                          Исходная запись
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {values[0]?.sourceId && <SourceLinks ids={[values[0].sourceId]} />}
      </Section>
      {!compact && (
        <Section
          title="Контекст лечения"
          description="Изменения плана рядом с динамикой, без автоматического вывода о причинной связи"
        >
          <div className={styles.timeline}>
            {patient.plan
              .filter((p) => p.status !== "draft")
              .map((p) => (
                <div className={styles.timelineItem} key={p.id}>
                  <time>{formatDate(p.confirmedAt)}</time>
                  <h3>{p.title}</h3>
                  <p>
                    {p.details}{" "}
                    {p.changeReason && `Причина изменения: ${p.changeReason}`}
                  </p>
                  <SourceLinks ids={p.sourceIds} />
                </div>
              ))}
          </div>
          {!patient.plan.some((p) => p.status !== "draft") && (
            <Empty title="Подтверждённых изменений пока нет" icon="calendar">
              После подтверждения плана здесь появится контекст лечения.
            </Empty>
          )}
        </Section>
      )}
      {!compact && <AssessmentForms patient={patient} actions={actions} />}
      {form && (
        <MeasurementForm
          patient={patient}
          actions={actions}
          onClose={() => setForm(false)}
        />
      )}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Исходный результат оценки"
      >
        {detail && (
          <div className={styles.stack}>
            <h3>
              {detail.title} · {formatDate(detail.measuredAt)}
            </h3>
            <dl className={styles.facts}>
              <div>
                <dt>Версия</dt>
                <dd>{detail.version}</dd>
              </div>
              <div>
                <dt>Временное окно</dt>
                <dd>{detail.window || "Не указано"}</dd>
              </div>
              <div>
                <dt>Автор записи</dt>
                <dd>{detail.author}</dd>
              </div>
              <div>
                <dt>Источник</dt>
                <dd>{detail.externalForm}</dd>
              </div>
              <div>
                <dt>Исходные значения</dt>
                <dd>
                  {detail.answers.length
                    ? detail.answers
                        .map((v) => (v === null ? "пропуск" : v))
                        .join(" · ")
                    : "Пункты не внесены; зарегистрирован внешний результат"}
                </dd>
              </div>
              <div>
                <dt>Заключение врача</dt>
                <dd>{detail.interpretation || "Не внесено"}</dd>
              </div>
            </dl>
            {detail.sourceId && <SourceLinks ids={[detail.sourceId]} />}
          </div>
        )}
      </Modal>
    </>
  );
}
