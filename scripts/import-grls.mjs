import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { gzipSync, gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { format } from "prettier";

const statuses = [
  "Действующий",
  "Изменённый",
  "Исключённый",
  "Истёкший",
  "Выдано по правилам ЕАЭС",
  "Действует, на подтверждении государственной регистрации",
  "Приостановлено применение",
  "Действует, в иностранных упаковках",
];
const active = new Set([statuses[0], statuses[4], statuses[5], statuses[7]]);
const output = "apps/web-doctor/src/workspace/grls-catalog.json.gz";
const manifestPath = "apps/web-doctor/src/workspace/grls-manifest.json";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const check = (ok, message) => {
  if (!ok) throw new Error(message);
};
const filenameStatus = (status) =>
  status.replaceAll(",", "").replaceAll(" ", "_");
export function verifyWorkbookSet(names) {
  check(
    names.length === statuses.length,
    "Нарушена полнота архива ГРЛС: нужны все восемь статусов.",
  );
  const dates = new Set(
    names.map((n) => /^grls(\d{4}-\d{2}-\d{2})-1-/.exec(n)?.[1]),
  );
  check(
    dates.size === 1 && !dates.has(undefined),
    "Разные или неизвестные даты выгрузки.",
  );
  const date = [...dates][0];
  for (const status of statuses)
    check(
      names.includes(`grls${date}-1-${filenameStatus(status)}.xlsx`),
      `Нарушена полнота архива: ${status}.`,
    );
  return date;
}
function text(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    check(
      !("formula" in value) && !("sharedFormula" in value),
      "Формулы в исходных данных не допускаются.",
    );
    if (Array.isArray(value.richText))
      return value.richText.map((r) => r.text).join("");
    if (typeof value.text === "string") return value.text;
    throw new Error("Неизвестный тип ячейки ГРЛС.");
  }
  return String(value).replaceAll("_x000D_", "\r").trim();
}
function date(value) {
  const raw = text(value);
  if (!raw || raw === "-" || raw === "~") return "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  check(m, `Неверная дата ГРЛС: ${raw}.`);
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  check(
    new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso,
    `Невозможная дата: ${raw}.`,
  );
  return iso;
}
export function recordFromCells(
  values,
  registrationStatus,
  sourceFile,
  sourceRow,
) {
  check(statuses.includes(registrationStatus), "Неизвестный статус ГРЛС.");
  const record = {
    registrationNumber: text(values[3]),
    registeredOn: date(values[4]),
    expiresOn: date(values[5]),
    cancelledOn: date(values[6]),
    holder: text(values[7]),
    holderCountry: text(values[8]),
    tradeName: text(values[9]),
    inn: text(values[10]),
    forms: text(values[11]),
    manufacturers: text(values[12]),
    normativeDocuments: text(values[13]),
    therapeuticGroup: text(values[14]),
    vital: text(values[15]),
    controlled: text(values[16]),
    orphan: text(values[17]),
    registrationStatus,
  };
  check(
    record.registrationNumber && record.tradeName,
    `Пустое РУ или название: ${sourceFile}:${sourceRow}.`,
  );
  return { recordId: hash(JSON.stringify(record)), ...record };
}
export function isCurrentRegistration(r, on) {
  return (
    active.has(r.registrationStatus) &&
    (r.registrationStatus === statuses[5] ||
      !r.expiresOn ||
      r.expiresOn >= on) &&
    (!r.cancelledOn || r.cancelledOn > on)
  );
}
export function isMedicinalProduct(r) {
  return (
    !/^ФС(?:-|\s)/i.test(r.registrationNumber) &&
    !/^субстанци[яи]/i.test(r.forms.trim())
  );
}
async function main() {
  if (process.argv.includes("--check")) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const bytes = await fs.readFile(output);
    check(
      hash(bytes) === manifest.artifactSha256,
      "SHA-256 ГРЛС не совпадает.",
    );
    const plain = gunzipSync(bytes);
    check(
      hash(plain) === manifest.contentSha256,
      "SHA-256 содержимого ГРЛС не совпадает.",
    );
    const catalog = JSON.parse(plain);
    check(
      catalog.records.length === manifest.currentRecords &&
        catalog.sourceVersion === manifest.sourceVersion,
      "Нарушены полнота или версия ГРЛС.",
    );
    check(
      catalog.records.every((r) =>
        isCurrentRegistration(r, manifest.snapshotDate),
      ),
      "Неактуальная запись среди доступных препаратов.",
    );
    console.log(
      `ГРЛС: ${catalog.records.length} актуальных записей, SHA-256 подтверждён.`,
    );
    return;
  }
  const archive = process.argv
    .find((a) => a.startsWith("--archive="))
    ?.slice(10);
  check(archive, "Укажите --archive=<путь к полному ZIP ГРЛС>.");
  // Resolve declared dependencies of the existing admin workspace, without adding packages.
  const require = createRequire(
    new URL("../apps/web-admin/package.json", import.meta.url),
  );
  const ExcelJS = require("exceljs");
  const JSZip = createRequire(require.resolve("exceljs/package.json"))("jszip");
  const archiveBytes = await fs.readFile(archive);
  const zip = await JSZip.loadAsync(archiveBytes, { checkCRC32: true });
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const snapshotDate = verifyWorkbookSet(names);
  const archiveSha256 = hash(archiveBytes);
  const sourceVersion = `grls-${snapshotDate}-${archiveSha256.slice(0, 12)}`;
  const records = new Map();
  const files = [];
  for (const status of statuses) {
    const name = `grls${snapshotDate}-1-${filenameStatus(status)}.xlsx`;
    const bytes = await zip.file(name).async("nodebuffer");
    // Official exports mix default and prefixed SpreadsheetML runs. ExcelJS omits
    // prefixed rich-text runs; canonicalize only prefixes bound to SpreadsheetML.
    const workbook = await JSZip.loadAsync(bytes);
    const stringsFile = workbook.file("xl/sharedStrings.xml");
    if (stringsFile) {
      let xml = await stringsFile.async("string");
      const prefixes = [
        ...xml.matchAll(
          /xmlns:(\w+)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g,
        ),
      ].map((m) => m[1]);
      for (const prefix of prefixes)
        xml = xml.replace(new RegExp(`(<\\/?)${prefix}:`, "g"), "$1");
      workbook.file("xl/sharedStrings.xml", xml);
    }
    const readableBytes = await workbook.generateAsync({ type: "nodebuffer" });
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(
      Readable.from(readableBytes),
      {
        sharedStrings: "cache",
        hyperlinks: "ignore",
        worksheets: "emit",
        styles: "ignore",
      },
    );
    let rows = 0,
      currentRows = 0,
      duplicates = 0,
      sheets = 0,
      substances = 0,
      footer = false;
    for await (const sheet of reader) {
      sheets++;
      for await (const row of sheet) {
        if (row.number === 3)
          check(
            text(row.values[4]).includes(
              snapshotDate.split("-").reverse().join("."),
            ),
            `Дата заголовка не совпадает: ${name}.`,
          );
        if (row.number === 5) {
          for (const [column, expected] of [
            [3, "Номер регистрационного удостоверения"],
            [4, "Дата регистрации"],
            [9, "Торговое наименование лекарственного препарата"],
            [10, "Международное непатентованное или химическое наименование"],
            [11, "Формы выпуска"],
          ])
            check(
              text(row.values[column]).replace(/\s+/g, " ") === expected,
              `Неверная структура столбца ${column}: ${name}.`,
            );
        }
        if (row.number === 6)
          check(
            text(row.values[3]) === status,
            `Статус внутри файла не совпадает: ${name}.`,
          );
        if (row.number < 7) continue;
        if (!row.values.some((v) => text(v))) continue;
        if (
          /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/.test(text(row.values[3])) &&
          row.values.slice(4).every((v) => !text(v))
        ) {
          check(
            text(row.values[3]).startsWith(
              snapshotDate.split("-").reverse().join("."),
            ),
            "Дата подвала не совпадает.",
          );
          footer = true;
          continue;
        }
        check(!footer, "Строки после завершающей даты выгрузки.");
        const record = recordFromCells(row.values, status, name, row.number);
        rows++;
        if (!isMedicinalProduct(record)) substances++;
        if (
          isCurrentRegistration(record, snapshotDate) &&
          isMedicinalProduct(record)
        ) {
          currentRows++;
          if (records.has(record.recordId)) duplicates++;
          records.set(record.recordId, record);
        }
      }
    }
    check(
      sheets === 1 && rows > 0 && footer,
      `Пустой, неполный или неожиданный файл ${name}.`,
    );
    files.push({
      name,
      status,
      sha256: hash(bytes),
      rows,
      currentRows,
      duplicates,
      substances,
    });
    console.log(`${status}: ${rows}; актуальных строк ${currentRows}.`);
  }
  const catalog = {
    sourceVersion,
    snapshotDate,
    records: [...records.values()].sort((a, b) =>
      a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0,
    ),
  };
  const bytes = gzipSync(JSON.stringify(catalog), { level: 9 });
  const manifest = {
    system: "GRLS",
    sourceVersion,
    snapshotDate,
    sourceUrl: "https://grls.minzdrav.gov.ru/grls.aspx",
    archiveName: path.basename(archive),
    archiveSha256,
    artifactSha256: hash(bytes),
    contentSha256: hash(JSON.stringify(catalog)),
    totalSourceRows: files.reduce((n, f) => n + f.rows, 0),
    currentRecords: catalog.records.length,
    activeStatuses: [...active],
    files,
  };
  await fs.writeFile(output, bytes);
  await fs.writeFile(
    manifestPath,
    await format(JSON.stringify(manifest), { parser: "json" }),
  );
  console.log(
    JSON.stringify({
      records: catalog.records.length,
      compressedBytes: bytes.length,
      sourceVersion,
    }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
