import type { ExportCell, ExportSnapshot, ExportTable } from "./exportSnapshot";
import fontUrl from "../../../../../packages/ui-web/src/styles/assets/Onest.ttf?url";

type WriterOptions = { signal?: AbortSignal; fontBytes?: Uint8Array };
const check = (options: WriterOptions) => options.signal?.throwIfAborted();
const display = (value: ExportCell) =>
  value === null
    ? "Нет данных"
    : typeof value === "number"
      ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
          value,
        )
      : value;

export async function writeXlsx(
  snapshot: ExportSnapshot,
  options: WriterOptions = {},
) {
  check(options);
  const { default: ExcelJS } = await import("exceljs");
  check(options);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Синкли";
  workbook.created = new Date(snapshot.createdAt);
  for (const table of snapshot.tables) {
    const sheet = workbook.addWorksheet(table.title, {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });
    sheet.addRow(table.columns);
    for (const row of table.rows)
      sheet.addRow(
        row.map((cell, index) =>
          typeof cell === "string" &&
          table.columns[index] === "Дата" &&
          /^\d{4}-\d{2}-\d{2}$/.test(cell)
            ? new Date(cell + "T00:00:00Z")
            : cell,
        ),
      );
    sheet.columns.forEach((column, index) => {
      column.width =
        table.id === "method" ? (index ? 85 : 28) : index === 0 ? 40 : 25;
      column.alignment = { vertical: "top", wrapText: true };
      if (table.columns[index] === "Дата") column.numFmt = "dd.mm.yyyy";
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF345D47" },
    };
    sheet.getRow(1).height = 30;
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: table.columns.length },
    };
    sheet.eachRow((row, index) => {
      if (index > 1) {
        let lines = 1;
        row.eachCell((cell, column) => {
          const width = Math.max(1, (sheet.getColumn(column).width ?? 25) - 2);
          const count = cell.text
            .split("\n")
            .reduce(
              (total, line) =>
                total + Math.max(1, Math.ceil((line.length * 1.3) / width)),
              0,
            );
          lines = Math.max(lines, count);
        });
        row.height = Math.min(409, Math.max(32, lines * 15 + 10));
        if (index % 2 === 0)
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F6EF" },
          };
      }
    });
    sheet.headerFooter.oddFooter = "Синкли · &P / &N";
  }
  const bytes = await workbook.xlsx.writeBuffer();
  check(options);
  return new Uint8Array(bytes);
}

export async function writePdf(
  snapshot: ExportSnapshot,
  options: WriterOptions = {},
) {
  check(options);
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const fontBytes =
    options.fontBytes ??
    (await fetch(fontUrl, { signal: options.signal }).then((response) => {
      if (!response.ok) throw new Error("Не удалось загрузить шрифт отчёта.");
      return response.arrayBuffer();
    }));
  check(options);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setTitle("Сводка клиники");
  document.setAuthor("Синкли");
  document.setCreationDate(new Date(snapshot.createdAt));
  if (!fontBytes) throw new Error("Не удалось загрузить шрифт отчёта.");
  const font = await document.embedFont(fontBytes, { subset: true });
  const supported = new Set(font.getCharacterSet());
  const clean = (text: string) =>
    Array.from(text.replace(/[\u0000-\u0008\u000b-\u001f]/g, ""))
      .map((char) => (supported.has(char.codePointAt(0)!) ? char : "?"))
      .join("");
  let page = document.addPage([595.28, 841.89]),
    y = 785;
  const ink = rgb(0.15, 0.22, 0.18),
    muted = rgb(0.43, 0.49, 0.44),
    green = rgb(0.2, 0.36, 0.28);
  const newPage = () => {
    page = document.addPage([595.28, 841.89]);
    y = 785;
  };
  function wrap(text: string, width: number, size = 9) {
    const lines: string[] = [];
    let line = "";
    for (const paragraph of clean(text).split("\n")) {
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width && line) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
      lines.push(line);
      line = "";
    }
    return lines;
  }
  function text(value: string, size = 10, color = ink) {
    for (const line of wrap(value, 515, size)) {
      if (y < 60) newPage();
      page.drawText(line, { x: 40, y, size, font, color });
      y -= size + 5;
    }
  }
  text("СИНКЛИ · СВОДКА КЛИНИКИ", 21, green);
  y -= 10;
  text(`${snapshot.filter.from} — ${snapshot.filter.to}`, 12);
  text(
    `${snapshot.department} · ${snapshot.doctor} · ${snapshot.group}`,
    10,
    muted,
  );
  text(`Сформирован: ${snapshot.createdAt}`, 8, muted);
  y -= 15;
  if (snapshot.empty) text("В выбранной выборке нет пациентов.", 11);
  if (snapshot.tables.some((t) => t.id === "daily")) {
    text("Динамика известных самоотчётов", 12, green);
    const left = 62,
      bottom = y - 140,
      width = 473,
      height = 115,
      max = Math.max(
        1,
        ...snapshot.daily.flatMap((d) => [d.reports, d.previous ?? 0]),
      );
    for (const value of [0, Math.ceil(max / 2), max]) {
      const gy = bottom + (value / max) * height;
      page.drawLine({
        start: { x: left, y: gy },
        end: { x: left + width, y: gy },
        color: rgb(0.87, 0.9, 0.87),
        thickness: 0.5,
      });
      page.drawText(String(value), {
        x: 40,
        y: gy - 3,
        font,
        size: 8,
        color: muted,
      });
    }
    for (const previous of [true, false]) {
      let last: { x: number; y: number } | null = null;
      snapshot.daily.forEach((row, index) => {
        const value = previous
          ? row.previous
          : row.available
            ? row.reports
            : null;
        if (value === null) {
          last = null;
          return;
        }
        const point = {
          x: left + (index / Math.max(1, snapshot.daily.length - 1)) * width,
          y: bottom + (value / max) * height,
        };
        if (last)
          page.drawLine({
            start: last,
            end: point,
            color: previous ? rgb(0.65, 0.55, 0.76) : rgb(0.18, 0.45, 0.7),
            thickness: previous ? 1 : 1.8,
            dashArray: previous ? [3, 3] : undefined,
          });
        page.drawCircle({
          x: point.x,
          y: point.y,
          size: previous ? 1.4 : 2,
          color: previous ? rgb(0.65, 0.55, 0.76) : rgb(0.18, 0.45, 0.7),
        });
        last = point;
      });
    }
    y = bottom - 20;
    text(
      "Синий: текущий период. Пунктир: предыдущий. Пропуски — разрывы.",
      8,
      muted,
    );
    y -= 12;
  }
  function table(table: ExportTable) {
    if (y < 145) newPage();
    text(table.title, 13, green);
    y -= 4;
    const widths =
      table.columns.length === 2
        ? [220, 295]
        : table.columns.map((_, i) =>
            i === 0 ? 150 : (515 - 150) / (table.columns.length - 1),
          );
    function row(cells: ExportCell[], header = false) {
      const lines = cells.map((cell, i) =>
        wrap(display(cell), widths[i]! - 14, header ? 8 : 9),
      );
      const height = Math.max(...lines.map((l) => l.length)) * 13 + 12;
      if (y - height < 55) {
        newPage();
        row(table.columns, true);
      }
      let x = 40;
      if (header)
        page.drawRectangle({
          x,
          y: y - height + 7,
          width: 515,
          height,
          color: rgb(0.91, 0.95, 0.88),
        });
      lines.forEach((values, index) => {
        values.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: x + 7,
            y: y - 6 - lineIndex * 13,
            font,
            size: header ? 8 : 9,
            color: header ? green : ink,
          }),
        );
        x += widths[index]!;
      });
      y -= height;
      page.drawLine({
        start: { x: 40, y: y + 6 },
        end: { x: 555, y: y + 6 },
        color: rgb(0.9, 0.93, 0.89),
        thickness: 0.4,
      });
    }
    row(table.columns, true);
    for (const values of table.rows) {
      check(options);
      row(values);
    }
    y -= 20;
  }
  for (const section of snapshot.tables) table(section);
  document.getPages().forEach((sheet, index) =>
    sheet.drawText(`Синкли · ${index + 1} / ${document.getPageCount()}`, {
      x: 40,
      y: 28,
      font,
      size: 8,
      color: muted,
    }),
  );
  check(options);
  return document.save();
}

export async function writePng(
  snapshot: ExportSnapshot,
  options: WriterOptions = {},
) {
  check(options);
  await document.fonts.ready;
  check(options);
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не поддерживает экспорт изображения.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 1800, 1000);
  context.fillStyle = "#26392e";
  context.font = "600 38px Onest, sans-serif";
  context.fillText("Синкли · динамика самоотчётов", 70, 85);
  context.font = "24px Onest, sans-serif";
  context.fillStyle = "#697a6b";
  context.fillText(`${snapshot.filter.from} — ${snapshot.filter.to}`, 70, 135);
  const labels = [snapshot.department, snapshot.doctor, snapshot.group].join(
    " · ",
  );
  let line = "",
    ty = 182;
  for (const word of labels.split(" ")) {
    if (context.measureText(line + word).width > 1640) {
      context.fillText(line, 70, ty);
      ty += 32;
      line = "";
    }
    line += word + " ";
  }
  context.fillText(line, 70, ty);
  context.fillStyle = "#2d74b4";
  context.fillRect(70, ty + 35, 24, 8);
  context.fillStyle = "#58695e";
  context.fillText("Текущий период", 108, ty + 46);
  context.fillStyle = "#9c86b4";
  context.fillRect(400, ty + 35, 24, 8);
  context.fillStyle = "#58695e";
  context.fillText("Предыдущий период", 438, ty + 46);
  const left = 100,
    right = 1700,
    top = ty + 110,
    bottom = 810,
    max = Math.max(
      1,
      ...snapshot.daily.flatMap((d) => [d.reports, d.previous ?? 0]),
    );
  for (const value of [0, Math.ceil(max / 2), max]) {
    const y = bottom - (value / max) * (bottom - top);
    context.strokeStyle = "#e4e9e2";
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillStyle = "#718072";
    context.fillText(String(value), 55, y + 7);
  }
  for (const previous of [true, false]) {
    context.strokeStyle = previous ? "#9c86b4" : "#2d74b4";
    context.lineWidth = previous ? 3 : 5;
    context.setLineDash(previous ? [10, 9] : []);
    context.beginPath();
    let connected = false;
    const points: { x: number; y: number }[] = [];
    snapshot.daily.forEach((row, index) => {
      const value = previous
        ? row.previous
        : row.available
          ? row.reports
          : null;
      if (value === null) {
        connected = false;
        return;
      }
      const x =
          left +
          (index / Math.max(1, snapshot.daily.length - 1)) * (right - left),
        y = bottom - (value / max) * (bottom - top);
      if (connected) context.lineTo(x, y);
      else context.moveTo(x, y);
      connected = true;
      points.push({ x, y });
    });
    context.stroke();
    context.fillStyle = previous ? "#9c86b4" : "#2d74b4";
    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, previous ? 4 : 5, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.setLineDash([]);
  context.fillStyle = "#718072";
  context.fillText(snapshot.filter.from, left, 855);
  context.textAlign = "right";
  context.fillText(snapshot.filter.to, right, 855);
  context.textAlign = "left";
  context.font = "19px Onest, sans-serif";
  context.fillText(
    `Известных записей: ${snapshot.summary.reports}. Пропуски показаны разрывами.`,
    70,
    905,
  );
  context.font = "16px Onest, sans-serif";
  context.fillText(
    `Сформирован: ${snapshot.createdAt}. Синтетический набор клиники и события текущего сеанса.`,
    70,
    940,
  );
  context.fillText(
    "Методика: известные самоотчёты по дням; ноль — известное значение; разрыв — отсутствие сводки. Пунктир — сопоставимый день ранее.",
    70,
    973,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Не удалось сформировать PNG.")),
      "image/png",
    ),
  );
  check(options);
  return blob;
}
