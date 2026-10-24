import type {
  AviandrFinding,
  AviandrInputs,
  AviandrReview,
  PatientRecord,
} from "./model";
import {
  aviandr,
  aviandrContext,
  evaluateAviandr,
  newAviandrReview,
  sameAviandrContext,
} from "./aviandr";
import { Badge, Button, Field, Select, Textarea, styles } from "./ui/Elements";

import type { WorkspaceActions } from "./useWorkspace";
import { PatientContext } from "./PatientContext";
const labels: Record<AviandrFinding["status"], string> = {
  contraindication: "Условие противопоказания",
  caution: "Мера предосторожности",
  missing: "Недостаточно данных",
  review: "Оценка врача",
  "not-identified": "Условие не отмечено",
};
const rank = {
  contraindication: 0,
  missing: 2,
  caution: 1,
  review: 3,
  "not-identified": 4,
};
export function AviandrSummary({
  review,
  stale = false,
  prominent = false,
}: {
  review: AviandrReview;
  stale?: boolean;
  prominent?: boolean;
}) {
  const rows = review.findings
    .slice()
    .sort((a, b) => rank[a.status] - rank[b.status]);
  const count = (status: AviandrFinding["status"]) =>
    rows.filter((r) => r.status === status).length;
  return (
    <div
      className={styles.smallStack}
      aria-label="Результаты проверки Авиандра"
    >
      <div className={styles.row}>
        <Badge tone="amber">Не утверждено</Badge>
        <strong>Проверка Авиандра · подготовка</strong>
      </div>
      <p className={styles.subtext}>
        {stale
          ? "Снимок относится к прежним данным карты. Уточнения требуют повторной сверки."
          : `Условия противопоказаний: ${count("contraindication")} · предосторожности: ${count("caution")} · без данных: ${count("missing")}`}
      </p>
      <p className={styles.notice}>
        Результат не подтверждает применимость препарата и не изменяет
        назначение. Решение принимает врач.
      </p>
      {prominent && (
        <div className={`${styles.smallStack} ${styles.prominentFindings}`}>
          {rows.slice(0, 3).map((row) => (
            <article
              key={row.id}
              className={`${styles.checkFinding} ${row.status === "contraindication" ? styles.checkContra : ""}`}
            >
              <div className={styles.row}>
                <Badge
                  tone={
                    row.status === "contraindication"
                      ? "red"
                      : row.status === "not-identified"
                        ? "neutral"
                        : "amber"
                  }
                >
                  {labels[row.status]}
                </Badge>
              </div>
              <h3>{row.title}</h3>
              <p>{row.detail}</p>
              <a
                href={review.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                ОХЛП · раздел {row.section}
              </a>
            </article>
          ))}
        </div>
      )}
      <details className={styles.details}>
        <summary>Результаты и основания · {rows.length}</summary>
        {rows.map((row) => (
          <article
            key={row.id}
            className={`${styles.checkFinding} ${row.status === "contraindication" ? styles.checkContra : ""}`}
          >
            <div className={styles.row}>
              <Badge
                tone={
                  row.status === "contraindication"
                    ? "red"
                    : row.status === "not-identified"
                      ? "neutral"
                      : "amber"
                }
              >
                {labels[row.status]}
              </Badge>
            </div>
            <h3>{row.title}</h3>
            <p>{row.detail}</p>
            <a
              href={review.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              ОХЛП · раздел {row.section}
            </a>
          </article>
        ))}
      </details>
      <details className={styles.details}>
        <summary>Источник и версия проверки</summary>
        <p>{aviandr.limitation}</p>
        <p className={styles.subtext}>
          ОХЛП от {review.sourceDate} · {review.sourceVersion}
        </p>
        {review.checkedAt && (
          <p className={styles.subtext}>
            Сохранено: {new Date(review.checkedAt).toLocaleString("ru-RU")} ·{" "}
            {review.checkedBy}
          </p>
        )}
        <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer">
          Открыть исходный документ
        </a>
      </details>
    </div>
  );
}
export function AviandrCheck({
  patient,
  planId,
  startDate,
  review,
  onChange,
  actions,
  showSummary = true,
}: {
  patient: PatientRecord;
  actions?: WorkspaceActions;
  showSummary?: boolean;
  planId: string;
  startDate: string;
  review: AviandrReview;
  onChange: (review: AviandrReview) => void;
}) {
  const context = aviandrContext(patient, planId);
  const stale = !sameAviandrContext(review.context, context);
  const set = (key: keyof AviandrInputs, value: string | number | null) =>
    onChange({
      ...review,
      inputs: { ...review.inputs, [key]: value },
      checkedAt: "",
      checkedBy: "",
    });
  const flag = (key: keyof AviandrInputs, label: string, hint?: string) => (
    <div key={key} className={styles.aviandrFlag}>
      <Select
        label={label}
        hint={hint}
        value={String(review.inputs[key])}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="unknown">Не уточнено</option>
        <option value="yes">Да, отмечено врачом</option>
        <option value="no">Нет, уточнено врачом</option>
      </Select>
    </div>
  );
  return (
    <section className={styles.aviandrEditor} aria-label="Проверка Авиандра">
      {stale && (
        <div role="alert" className={styles.notice}>
          <strong>Данные карты изменились</strong>
          <p>
            Текст назначения сохранён в форме. Перед сохранением проверки заново
            сверьте сведения; прежние уточнения будут сброшены.
          </p>
          <Button
            variant="secondary"
            onClick={() => onChange(newAviandrReview(patient, planId))}
          >
            Обновить контекст и сбросить уточнения
          </Button>
        </div>
      )}
      {showSummary && (
        <AviandrSummary
          review={{
            ...review,
            findings: stale
              ? review.findings
              : evaluateAviandr(review, startDate),
          }}
          stale={stale}
        />
      )}
      <PatientContext patient={patient} actions={actions} compact />
      <fieldset
        disabled={stale}
        className={styles.form}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <legend>Уточнения врача</legend>
        <Select
          label="Основание для рассмотрения Авиандра"
          value={review.inputs.indication}
          onChange={(e) => set("indication", e.target.value)}
        >
          <option value="unknown">Не уточнено</option>
          <option value="gad">Генерализованное тревожное расстройство</option>
          <option value="post-covid">
            После COVID-19: тревога при стрессовой реакции / нарушении адаптации
            лёгкой или средней степени
          </option>
          <option value="other">
            Другое основание · требует отдельной оценки
          </option>
        </Select>
        {aviandr.rules
          .filter((r) =>
            ["hypersensitivity", "epilepsy", "liverFailure"].includes(r.id),
          )
          .map((r) => flag(r.id as keyof AviandrInputs, r.title))}
        <details className={styles.details}>
          <summary>Другие состояния и ограничения</summary>
          <div className={styles.form}>
            {aviandr.rules
              .filter(
                (r) =>
                  ![
                    "hypersensitivity",
                    "epilepsy",
                    "liverFailure",
                    "serotonergic",
                    "sedative",
                    "cyp2d6",
                    "alcohol",
                  ].includes(r.id),
              )
              .map((r) => flag(r.id as keyof AviandrInputs, r.title))}
          </div>
        </details>
        <details className={styles.details}>
          <summary>Функция почек</summary>
          <div className={styles.form}>
            <div className={styles.formPair}>
              <Field
                label="СКФ"
                type="number"
                min={0}
                max={300}
                step="any"
                value={review.inputs.egfr ?? ""}
                onChange={(e) =>
                  set(
                    "egfr",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
              <Select
                label="Единицы СКФ"
                value={review.inputs.egfrUnit}
                onChange={(e) => set("egfrUnit", e.target.value)}
              >
                <option value="unknown">Не уточнены</option>
                <option value="ml/min">мл/мин</option>
                <option value="ml/min/1.73m2">мл/мин/1,73 м²</option>
              </Select>
            </div>
            <Field
              label="Дата определения СКФ"
              type="date"
              value={review.inputs.egfrDate}
              onChange={(e) => set("egfrDate", e.target.value)}
            />
          </div>
        </details>
        {flag(
          "medicationListVerified",
          "Лекарственный анамнез сверен",
          "Включая безрецептурные средства, добавки и недавно отменённые препараты.",
        )}
        {flag(
          "maoUse",
          "Приём ингибиторов МАО",
          "«Нет» без даты отмены означает, что врач исключил также недавний приём. Если препарат отменён, укажите дату.",
        )}
        <Field
          label="Дата отмены последнего ингибитора МАО, если принимался"
          type="date"
          value={review.inputs.lastMaoDate}
          onChange={(e) => set("lastMaoDate", e.target.value)}
        />
        <details className={styles.details}>
          <summary>Лекарственные взаимодействия</summary>
          <div className={styles.form}>
            {" "}
            {aviandr.rules
              .filter((r) =>
                ["serotonergic", "sedative", "cyp2d6", "alcohol"].includes(
                  r.id,
                ),
              )
              .map((r) => flag(r.id as keyof AviandrInputs, r.title))}
          </div>
        </details>
        <Textarea
          label="Основание уточнений"
          hint="Документ и дата, сведения текущего приёма или со слов пациента. Неизвестные ответы оставьте неуточнёнными."
          value={review.inputs.evidence}
          onChange={(e) => set("evidence", e.target.value)}
          rows={3}
        />
      </fieldset>
      <details className={styles.details}>
        <summary>Другие сведения карты</summary>
        <dl className={styles.smallStack}>
          {(
            [
              ["Дата рождения", context.birthDate],
              ["Заболевания", context.conditions],
              ["Репродуктивный контекст", context.reproductiveContext],
              ["Вещества и алкоголь", context.substanceUse],
              [
                "Эпизоды и диагнозы",
                context.diagnoses
                  .map((line) => {
                    const parts = line.split(" | ");
                    const status = parts.pop();
                    return [
                      ...parts.filter(Boolean),
                      status === "hypothesis"
                        ? "Рабочая гипотеза"
                        : status === "confirmed"
                          ? "Подтверждён"
                          : status,
                    ].join(" · ");
                  })
                  .join("\n"),
              ],
              [
                "Лекарственные назначения и история",
                context.medicines
                  .map((line) => {
                    const parts = line.split(" | ");
                    const statusIndex = 5;
                    const translated = (
                      {
                        confirmed: "Подтверждено",
                        completed: "Завершено",
                        stopped: "Прекращено",
                        draft: "Черновик",
                      } as Record<string, string>
                    )[parts[statusIndex] ?? ""];
                    if (translated) parts[statusIndex] = translated;
                    return parts.filter(Boolean).join(" · ");
                  })
                  .join("\n"),
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className={styles.subtext}>{label}</dt>
              <dd
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {value || "Нет сведений · требуется уточнение"}
              </dd>
            </div>
          ))}
        </dl>
        <p className={styles.subtext}>
          Свободный текст не классифицируется автоматически. Уточнения ниже
          сохраняются в проверке этого назначения.
        </p>
      </details>
    </section>
  );
}
