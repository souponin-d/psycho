import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@psycho/ui-web";
import type { ClinicAnalysis } from "./aggregate";
import type { ClinicDataset } from "./model";
import {
  exportSections,
  createExportSnapshot,
  type ExportSection,
  type ExportSnapshot,
} from "./exportSnapshot";
import {
  generateExportFile,
  downloadExport,
  type ExportFormat,
} from "./exportFile";
import { TrendChart, number } from "./Charts";
import styles from "./exportCenter.module.css";
const formats = [
  { id: "pdf", title: "PDF", description: "Готовый отчёт" },
  { id: "xlsx", title: "XLSX", description: "Таблицы Excel" },
  { id: "csv", title: "CSV", description: "Одна таблица" },
  { id: "png", title: "PNG", description: "График" },
] as const;
type ReadyFile = {
  id: string;
  blob: Blob;
  name: string;
  snapshot: ExportSnapshot;
  format: ExportFormat;
};
type Job =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; message: string }
  | { status: "cancelled" };
export function ExportCenter({
  data,
  result,
}: {
  data: ClinicDataset;
  result: ClinicAnalysis;
}) {
  const [format, setFormat] = useState<ExportFormat>("xlsx"),
    [sections, setSections] = useState<ExportSection[]>(
      exportSections.map((s) => s.id),
    );
  const [csvSection, setCsvSection] = useState<ExportSection>("team"),
    [job, setJob] = useState<Job>({ status: "idle" }),
    [files, setFiles] = useState<ReadyFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null),
    [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const currentJob = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      currentJob.current?.abort();
    };
  }, []);
  const selected = useMemo(
    () =>
      format === "png"
        ? (["daily"] as ExportSection[])
        : format === "csv"
          ? [csvSection]
          : sections,
    [format, csvSection, sections],
  );
  const snapshot = useMemo(
    () =>
      selected.length
        ? createExportSnapshot(data, result.filter, selected)
        : null,
    [data, result.filter, selected],
  );
  const active = files.find((file) => file.id === activeId),
    busy = job.status === "working";
  useEffect(() => {
    if (!active || !["pdf", "png"].includes(active.format)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(active.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [active]);
  async function generate() {
    if (!snapshot || snapshot.empty || busy) return;
    const frozen = createExportSnapshot(data, result.filter, selected),
      controller = new AbortController(),
      id = crypto.randomUUID();
    currentJob.current = controller;
    setJob({ status: "working" });
    try {
      const blob = await generateExportFile(
        frozen,
        format,
        csvSection,
        controller.signal,
      );
      if (controller.signal.aborted || !mounted.current) return;
      const name = `syncli_${frozen.filter.from}_${frozen.filter.to}_${frozen.createdAt.replace(/[^0-9]/g, "")}.${format}`;
      setFiles((previous) =>
        [{ id, blob, name, snapshot: frozen, format }, ...previous].slice(0, 5),
      );
      setActiveId(id);
      setJob({ status: "idle" });
    } catch (error) {
      if (!controller.signal.aborted && mounted.current)
        setJob({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Не удалось сформировать файл.",
        });
    }
  }
  return (
    <div className={styles.center}>
      <section className={styles.settings} aria-label="Настройки экспорта">
        <h2>Экспорт данных</h2>
        <p>Сохранить текущую выборку</p>
        <fieldset disabled={busy}>
          <legend>Формат</legend>
          <div className={styles.formats}>
            {formats.map((item) => (
              <label
                key={item.id}
                className={format === item.id ? styles.selected : ""}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={item.id}
                  checked={format === item.id}
                  onChange={() => setFormat(item.id)}
                />
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </label>
            ))}
          </div>
        </fieldset>
        {format === "csv" ? (
          <label className={styles.field}>
            Таблица CSV
            <select
              disabled={busy}
              value={csvSection}
              onChange={(e) =>
                setCsvSection(e.currentTarget.value as ExportSection)
              }
            >
              {exportSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
            <small>Метаданные добавятся отдельными колонками.</small>
          </label>
        ) : format === "png" ? (
          <p>
            Динамика самоотчётов · PNG 1800 × 1000 с периодом, фильтрами и
            легендой.
          </p>
        ) : (
          <fieldset disabled={busy}>
            <legend>Состав файла</legend>
            {exportSections.map((section) => (
              <label className={styles.check} key={section.id}>
                <input
                  type="checkbox"
                  checked={sections.includes(section.id)}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    setSections((value) =>
                      checked
                        ? [...value, section.id]
                        : value.filter((id) => id !== section.id),
                    );
                  }}
                />
                {section.title}
              </label>
            ))}
            <label className={styles.check}>
              <input type="checkbox" checked disabled />
              Методика и фильтры
            </label>
          </fieldset>
        )}
        <div className={styles.scope}>
          <strong>Текущая выборка</strong>
          <span>
            {result.filter.from} — {result.filter.to}
          </span>
          <span>{snapshot?.department ?? "Выберите разделы"}</span>
          <span>{snapshot?.doctor}</span>
          <span>{snapshot?.group}</span>
        </div>
        {!snapshot && <p role="status">Выберите хотя бы один раздел.</p>}
        {snapshot?.empty && (
          <p role="status">
            В выбранной выборке нет пациентов. Измените фильтры или набор
            данных.
          </p>
        )}
        {busy ? (
          <div className={styles.job} role="status">
            Формирование файла…
            <Button
              variant="secondary"
              onClick={() => {
                currentJob.current?.abort();
                setJob({ status: "cancelled" });
              }}
            >
              Отменить формирование
            </Button>
          </div>
        ) : (
          <Button disabled={!snapshot || snapshot.empty} onClick={generate}>
            {job.status === "error"
              ? "Повторить формирование"
              : `Сформировать ${format.toUpperCase()}`}
          </Button>
        )}
        {job.status === "error" && (
          <p className={styles.error} role="alert">
            {job.message} Файл не создан.
          </p>
        )}
        {job.status === "cancelled" && (
          <p role="status">Формирование отменено. Готовый файл не добавлен.</p>
        )}
        <small className={styles.note}>
          До пяти готовых файлов хранятся в памяти раздела. Повторное скачивание
          сохраняет исходный снимок.
        </small>
      </section>
      <section className={styles.preview} aria-label="Предпросмотр экспорта">
        <header>
          <h2>Предпросмотр</h2>
          <span>
            {format.toUpperCase()}{" "}
            {snapshot && format === "xlsx"
              ? `· ${snapshot.tables.length} листов`
              : ""}
          </span>
        </header>
        {snapshot ? (
          <article className={styles.paper}>
            <div className={styles.brand}>синкли ·</div>
            <h3>Сводка клиники</h3>
            <p>
              {snapshot.filter.from} — {snapshot.filter.to}
            </p>
            <p>
              {snapshot.department} · {snapshot.doctor} · {snapshot.group}
            </p>
            <div className={styles.metrics}>
              <span>
                <strong>{snapshot.summary.patients}</strong>на сопровождении
              </span>
              <span>
                <strong>{number(snapshot.summary.reports)}</strong>самоотчётов
              </span>
            </div>
            {format === "png" ? (
              <TrendChart
                key={`${snapshot.filter.from}:${snapshot.filter.to}`}
                rows={snapshot.daily}
              />
            ) : (
              snapshot.tables.map((table) => (
                <details key={table.id} open={table.id !== "method"}>
                  <summary>
                    {table.title} · {table.rows.length} строк
                  </summary>
                  <div
                    className={styles.tableScroll}
                    tabIndex={0}
                    role="region"
                    aria-label={`Таблица: ${table.title}`}
                  >
                    <table
                      className={
                        table.columns.length > 2 ? styles.wideTable : undefined
                      }
                    >
                      <thead>
                        <tr>
                          {table.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.slice(0, 8).map((row, index) => (
                          <tr key={index}>
                            {row.map((cell, column) => (
                              <td key={column}>
                                {cell === null
                                  ? "Нет данных"
                                  : typeof cell === "number"
                                    ? number(cell)
                                    : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {table.rows.length > 8 && (
                    <small>
                      Показаны первые 8 строк. В файл войдут все{" "}
                      {table.rows.length}.
                    </small>
                  )}
                </details>
              ))
            )}
          </article>
        ) : (
          <p>Выберите состав файла для предпросмотра.</p>
        )}
      </section>
      {!!files.length && (
        <section className={styles.history} aria-label="Готовые файлы">
          <header>
            <h2>Готовые файлы</h2>
            <Button
              variant="secondary"
              onClick={() => {
                setFiles([]);
                setActiveId(null);
              }}
            >
              Очистить список
            </Button>
          </header>
          {files.map((file) => (
            <div className={styles.file} key={file.id}>
              <div>
                <strong>Файл готов</strong>
                <span>{file.name}</span>
                <small>
                  {file.snapshot.department} · {file.snapshot.filter.from} —{" "}
                  {file.snapshot.filter.to} · {Math.ceil(file.blob.size / 1024)}{" "}
                  КБ
                </small>
              </div>
              <Button variant="secondary" onClick={() => setActiveId(file.id)}>
                Предпросмотр файла
              </Button>
              <Button onClick={() => downloadExport(file.blob, file.name)}>
                Скачать {file.format.toUpperCase()}
              </Button>
            </div>
          ))}
          {active &&
            previewUrl &&
            (active.format === "pdf" ? (
              <iframe
                className={styles.filePreview}
                title={`Готовый PDF: ${active.name}`}
                src={previewUrl}
              />
            ) : (
              <img
                className={styles.pngPreview}
                alt={`Готовый график: ${active.name}`}
                src={previewUrl}
              />
            ))}
          {active && !previewUrl && (
            <p>
              Выбран готовый файл: {active.name}. Период и фильтры указаны в
              строке файла; скачать можно повторно.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
