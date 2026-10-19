import { useEffect, useRef, useState } from "react";
import { Button, DemoDataPicker, DemoMetrics, TextField } from "@psycho/ui-web";
import type { Scenario } from "@psycho/ui-web/contracts";
import {
  doctorDemoSchema,
  doctorDemoSources,
  type DoctorDemoData,
} from "./data";
import styles from "./DoctorDemo.module.css";

const statusLabels = {
  updated: "Новые данные",
  scheduled: "Запланирован визит",
  quiet: "Без обновлений",
};

function DoctorSession({ data }: { data: DoctorDemoData }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  const visible = data.patients.filter(
    (patient) =>
      (status === "all" || patient.status === status) &&
      `${patient.name} ${patient.code}`
        .toLocaleLowerCase("ru")
        .includes(query.trim().toLocaleLowerCase("ru")),
  );
  const selected =
    visible.find((patient) => patient.id === selectedId) ?? visible[0];
  useEffect(() => {
    if (focusDetail.current) {
      detailHeading.current?.focus();
      focusDetail.current = false;
    }
  }, [selectedId]);
  return (
    <div className="stack">
      <DemoMetrics items={data.highlights} label="Обзор кабинета" />
      <div className={styles.workspace}>
        <section className="panel" aria-labelledby="patient-list-title">
          <div className="demo-section-heading">
            <div>
              <p className="demo-eyebrow">01 / МОЙ КАБИНЕТ</p>
              <h2 id="patient-list-title">Ваши пациенты</h2>
            </div>
            <span className="demo-count" aria-live="polite">
              Найдено: {visible.length}
            </span>
          </div>
          <div className={styles.filters}>
            <TextField
              label="Поиск пациентов"
              value={query}
              onChange={setQuery}
              placeholder="Обозначение или код"
            />
            <label className="demo-picker">
              Состояние записи
              <select
                value={status}
                onChange={(event) => setStatus(event.currentTarget.value)}
              >
                <option value="all">Все записи</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {visible.length ? (
            <ul className={styles.patients}>
              {visible.map((patient) => (
                <li key={patient.id}>
                  <button
                    className={styles.patient}
                    aria-label={`Открыть ${patient.name}`}
                    aria-pressed={selected?.id === patient.id}
                    onClick={() => {
                      if (selectedId === patient.id) {
                        detailHeading.current?.focus();
                        return;
                      }
                      focusDetail.current = true;
                      setSelectedId(patient.id);
                    }}
                  >
                    <span className={styles.avatar} aria-hidden="true">
                      {patient.code.slice(-2)}
                    </span>
                    <span className={styles.patientName}>
                      <strong>{patient.name}</strong>
                      <small>
                        {patient.secondaryText || "Без дополнительной подписи"}
                      </small>
                    </span>
                    <span
                      className={styles.status}
                      data-status={patient.status}
                    >
                      {statusLabels[patient.status]}
                    </span>
                    <span className={styles.arrow} aria-hidden="true">
                      ↗
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="demo-empty">
              <h3>
                {data.patients.length
                  ? "По вашему запросу ничего не найдено."
                  : "Пациентов пока нет."}
              </h3>
              <p>
                {data.patients.length
                  ? "Измените обозначение или состояние записи."
                  : "В этом наборе нет учебных записей. Можно переключиться на рабочий день."}
              </p>
              {data.patients.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                >
                  Сбросить поиск
                </Button>
              )}
            </div>
          )}
        </section>
        <section
          className={`panel ${styles.detail}`}
          aria-label="Выбранная запись"
        >
          <p className="demo-eyebrow">02 / КОНТЕКСТ ВСТРЕЧИ</p>
          {selected ? (
            <>
              <h2
                ref={detailHeading}
                tabIndex={-1}
                className={styles.detailTitle}
              >
                {selected.name}
              </h2>
              <p className={styles.recordCode}>
                {selected.code} · вымышленная запись
              </p>
              <p className={styles.summary}>{selected.summary}</p>
              <dl className={styles.facts}>
                <div>
                  <dt>Следующая встреча</dt>
                  <dd>{selected.nextVisit ?? "Не запланирована"}</dd>
                </div>
                <div>
                  <dt>Последнее обновление</dt>
                  <dd>{selected.lastUpdate ?? "Обновлений нет"}</dd>
                </div>
              </dl>
              <h3 className={styles.timelineTitle}>Последние события</h3>
              {selected.events.length ? (
                <ol className="demo-timeline">
                  {selected.events.map((event) => (
                    <li key={event.id}>
                      <span>{event.date}</span>
                      <strong>{event.title}</strong>
                      <p>{event.body}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="demo-empty-note">Событий пока нет.</p>
              )}
            </>
          ) : (
            <div className="demo-empty">
              <h2>Выберите запись</h2>
              <p>Здесь появятся её сведения и история учебных событий.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function DoctorDemo() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const result = doctorDemoSchema.safeParse(doctorDemoSources[scenario]);
  const valid = result.success && result.data.scenario === scenario;
  return (
    <div className="demo-page">
      <div className="demo-context">
        <div>
          <p className="demo-eyebrow">ДЕМОНСТРАЦИОННЫЙ КАБИНЕТ</p>
          <p>
            {valid
              ? `${result.data.doctor.name} · ${result.data.doctor.unit}`
              : "Данные кабинета"}
          </p>
          <span className="muted">
            Снимок: {valid ? result.data.snapshot : "не загружен"}
          </span>
        </div>
        <DemoDataPicker value={scenario} onChange={setScenario} />
      </div>
      {valid ? (
        <DoctorSession key={scenario} data={result.data} />
      ) : (
        <p role="alert" className="notice">
          Ошибка демо врача: {scenario}.json —{" "}
          {result.success
            ? "scenario не соответствует набору"
            : result.error.issues
                .map((issue) => issue.path.join("."))
                .join(", ")}
        </p>
      )}
      <p className="demo-footnote">
        Все записи вымышлены. Поиск и выбор работают только в этой вкладке;
        изменения не сохраняются.
      </p>
    </div>
  );
}
