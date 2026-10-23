import { it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { createClinicDataset, DATA_START } from "./fixtures";
import { defaultFilter } from "./aggregate";
import { createExportSnapshot } from "./exportSnapshot";
import { writeXlsx, writePdf, writePng } from "./exportWriters";

it("увеличивает строки Excel под длинные подписи отделения", async () => {
  const snapshot = createExportSnapshot(
    createClinicDataset("long"),
    defaultFilter(),
    ["team"],
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await writeXlsx(snapshot)) as never);
  const row = workbook.worksheets[0]!.getRow(2);
  expect(String(row.getCell(5).value).length).toBeGreaterThan(60);
  expect(row.height).toBeGreaterThan(60);
});

it("рисует отдельные точки PNG и сохраняет дату и источник выгрузки", async () => {
  const snapshot = createExportSnapshot(
    createClinicDataset("normal"),
    { ...defaultFilter(), from: "2026-10-20", to: "2026-10-20" },
    ["daily"],
    "2026-10-23T10:00:00.000Z",
  );
  const context = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 100 }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as never);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) =>
      callback(new Blob(["png"], { type: "image/png" })),
    );
  try {
    await writePng(snapshot);
    expect(context.arc).toHaveBeenCalledTimes(2);
    const labels = context.fillText.mock.calls.map((call) => call[0]).join(" ");
    expect(labels).toContain(snapshot.createdAt);
    expect(labels).toContain("Синтетический набор");
  } finally {
    getContext.mockRestore();
    toBlob.mockRestore();
  }
});

it("записывает настоящий XLSX с числами, датами, пустыми ячейками и пятью листами", async () => {
  const snapshot = createExportSnapshot(
    createClinicDataset("normal"),
    defaultFilter(),
    ["summary", "team", "daily", "medical"],
  );
  const bytes = await writeXlsx(snapshot);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  expect(workbook.worksheets).toHaveLength(5);
  expect(workbook.worksheets[0]!.getCell("B4").value).toBe(621);
  const daily = workbook.getWorksheet("Динамика по дням")!;
  expect(daily.getCell("A2").value).toBeInstanceOf(Date);
  const missing = daily
    .getRows(2, 30)!
    .find((row) =>
      (row.getCell(1).value as Date).toISOString().startsWith("2026-10-08"),
    )!;
  expect(missing.getCell(2).value).toBeNull();
  expect(daily.views[0]!.state).toBe("frozen");
});
it("создаёт открываемый многостраничный PDF с кириллическим шрифтом для 180 дней", async () => {
  const snapshot = createExportSnapshot(
    createClinicDataset("long"),
    { ...defaultFilter(), from: DATA_START },
    ["summary", "team", "daily", "medical"],
  );
  const font = await readFile("packages/ui-web/src/styles/assets/Onest.ttf");
  const bytes = await writePdf(snapshot, { fontBytes: new Uint8Array(font) });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(3);
  expect(pdf.getTitle()).toBe("Сводка клиники");
  expect(bytes.byteLength).toBeGreaterThan(10000);
}, 20000);
it("не возвращает готовый файл после отмены", async () => {
  const controller = new AbortController();
  controller.abort();
  const snapshot = createExportSnapshot(
    createClinicDataset("normal"),
    defaultFilter(),
    ["summary"],
  );
  await expect(
    writeXlsx(snapshot, { signal: controller.signal }),
  ).rejects.toThrow();
});
