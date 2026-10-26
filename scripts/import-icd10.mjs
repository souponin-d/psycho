import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { format } from "prettier";

const oid = "1.2.643.5.1.13.13.11.1005";
const base = "https://esnsi.gosuslugi.ru/rest/ext/v1/classifiers/5697";
const output = "apps/web-doctor/src/workspace/icd10-ru";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const check = (ok, message) => {
  if (!ok) throw new Error(message);
};

/** Pure normalization: titles and source identifiers are never rewritten. */
export function buildCatalog(passport, pages) {
  const source = passport.classifier;
  check(
    source?.code === oid && Number.isInteger(source.version),
    "Неверный паспорт МКБ-10.",
  );
  const total = pages[0]?.total;
  check(
    total > 0 &&
      pages.every(
        (p, i) =>
          p.currentPage === i + 1 &&
          p.total === total &&
          p.errors?.length === 0,
      ),
    "Нарушена полнота страниц.",
  );
  const records = pages
    .flatMap((p) => p.body)
    .map((row) => {
      const values = Object.fromEntries(
        row.elements.map((e) => [e.order, e.value]),
      );
      check(
        values[0] &&
          values[1] &&
          values[2] &&
          values[3] &&
          ["0", "1"].includes(values[6]),
        "Неполная запись источника.",
      );
      const code = values[2];
      const kind = /^[IVX]+$/.test(code)
        ? "chapter"
        : /^[A-Z]\d{2}-[A-Z]\d{2}$/.test(code)
          ? "block"
          : /^[A-Z]\d{2}(\.\d{1,2})?$/.test(code)
            ? "code"
            : null;
      check(kind, `Неизвестный вид кода ${code}.`);
      return {
        id: values[0],
        sortCode: values[1],
        code,
        title: values[3],
        parentId: values[4],
        additionalCode: values[5],
        active: values[6] === "1",
        activityChangedOn: values[7],
        sourceKey: values[8],
        kind,
      };
    });
  check(records.length === total, "Нарушена полнота выгрузки.");
  check(
    new Set(records.map((r) => r.id)).size === total &&
      new Set(records.map((r) => r.code)).size === total,
    "Обнаружены дубли записей.",
  );
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const record of records) {
    const seen = new Set([record.id]);
    let id = record.parentId;
    while (id !== null) {
      check(byId.has(id) && !seen.has(id), "Повреждена иерархия МКБ-10.");
      seen.add(id);
      id = byId.get(id).parentId;
    }
  }
  records.sort((a, b) =>
    a.sortCode < b.sortCode
      ? -1
      : a.sortCode > b.sortCode
        ? 1
        : Number(a.id) - Number(b.id),
  );
  return {
    source: {
      system: "ICD-10-RU",
      sourceOid: oid,
      sourceVersion: `esnsi-${source.version}`,
      publisher: "Министерство здравоохранения Российской Федерации",
      url: "https://esnsi.gosuslugi.ru/classifiers/5697/data",
      revision: source.version,
      updatedAt: source.lastUpdateDate,
    },
    records,
  };
}

export function verifyCatalog(catalog, manifest) {
  check(
    hash(JSON.stringify(catalog)) === manifest.catalogSha256,
    "Контрольная сумма МКБ-10 не совпадает.",
  );
  check(
    catalog.records.length === manifest.total &&
      catalog.source.sourceVersion === manifest.sourceVersion,
    "Нарушена полнота или версия МКБ-10.",
  );
}

async function main() {
  if (process.argv.includes("--check")) {
    verifyCatalog(
      JSON.parse(await fs.readFile(`${output}.json`, "utf8")),
      JSON.parse(await fs.readFile(`${output}.manifest.json`, "utf8")),
    );
    console.log("МКБ-10: версия, полнота и SHA-256 подтверждены.");
    return;
  }
  const cache =
    process.argv.find((a) => a.startsWith("--cache="))?.slice(8) ??
    ".cache/icd10-source-research";
  const read = async (relative, url) => {
    const file = path.join(cache, relative);
    if (process.argv.includes("--download")) {
      const response = await fetch(url);
      check(response.ok, `HTTP ${response.status}: ${url}`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
    }
    return fs.readFile(file);
  };
  const passportBytes = await read("passport.json", base);
  const passport = JSON.parse(passportBytes);
  const revision = passport.classifier.version;
  const pages = [],
    sourcePages = [];
  for (
    let page = 1;
    page === 1 || pages.flatMap((p) => p.body).length < pages[0].total;
    page++
  ) {
    const url = `${base}/data?version=${revision}&pageNumber=${page}&pageSize=1000`;
    const bytes = await read(
      `pages/${revision}/page-${String(page).padStart(4, "0")}.json`,
      url,
    );
    const data = JSON.parse(bytes);
    check(data.body?.length > 0, "Пустая страница до завершения выгрузки.");
    pages.push(data);
    sourcePages.push({
      page,
      url,
      rows: data.body.length,
      sha256: hash(bytes),
    });
  }
  if (process.argv.includes("--download")) {
    const after = await fetch(base).then((r) => r.json());
    check(
      after.classifier.version === revision,
      "Версия изменилась при загрузке. Повторите импорт.",
    );
  }
  const catalog = buildCatalog(passport, pages);
  const manifest = {
    sourceVersion: catalog.source.sourceVersion,
    total: catalog.records.length,
    chapters: catalog.records.filter((r) => r.kind === "chapter").length,
    blocks: catalog.records.filter((r) => r.kind === "block").length,
    selectable: catalog.records.filter((r) => r.kind === "code" && r.active)
      .length,
    inactive: catalog.records.filter((r) => !r.active).length,
    catalogSha256: hash(JSON.stringify(catalog)),
    passportSha256: hash(passportBytes),
    sourcePages,
  };
  check(manifest.chapters === 22, "Неполный набор классов МКБ-10.");
  manifest.artifactSha256 = hash(
    await format(JSON.stringify(catalog), { parser: "json" }),
  );
  for (const [suffix, data] of [
    [".json", catalog],
    [".manifest.json", manifest],
  ])
    await fs.writeFile(
      output + suffix,
      await format(JSON.stringify(data), { parser: "json" }),
    );
  console.log(JSON.stringify({ ...manifest, sourcePages: sourcePages.length }));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
