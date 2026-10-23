import {
  tableCsv,
  type ExportSnapshot,
  type ExportSection,
} from "./exportSnapshot";
import { writePdf, writePng, writeXlsx } from "./exportWriters";
export type ExportFormat = "pdf" | "xlsx" | "csv" | "png";
export async function generateExportFile(
  snapshot: ExportSnapshot,
  format: ExportFormat,
  tableId: ExportSection,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (format === "png") return writePng(snapshot, { signal });
  if (format === "csv") {
    const table = snapshot.tables.find((table) => table.id === tableId);
    if (!table) throw new Error("Выбранная таблица отсутствует в снимке.");
    const metadata = snapshot.tables.find((t) => t.id === "method")!;
    return new Blob(
      [
        tableCsv({
          ...table,
          columns: [
            ...table.columns,
            ...metadata.rows.map((row) => `Метаданные: ${row[0]}`),
          ],
          rows: table.rows.map((row) => [
            ...row,
            ...metadata.rows.map((meta) => meta[1] ?? null),
          ]),
        }),
      ],
      { type: "text/csv;charset=utf-8" },
    );
  }
  const bytes =
    format === "pdf"
      ? await writePdf(snapshot, { signal })
      : await writeXlsx(snapshot, { signal });
  signal.throwIfAborted();
  return new Blob([new Uint8Array(bytes)], {
    type:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
export function downloadExport(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
