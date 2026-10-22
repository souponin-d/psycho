import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// Исходные формулировки читаются только из локальных источников. В Git хранится
// извлекатель, а формы и отчёт записываются исключительно в игнорируемый .cache.
// node scripts/prepare-doctor-forms.mjs --source-dir <папка> [--s38-text <layout.txt>]
// node scripts/prepare-doctor-forms.mjs --self-test
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".cache", "doctor-server", "clinical-forms");
const { values: args } = parseArgs({
  options: {
    "source-dir": { type: "string" },
    "s38-text": { type: "string" },
    "self-test": { type: "boolean" },
  },
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plain = (value) =>
  value
    .replace(/\*\*|\*/g, "")
    .replace(/^#+\s*/, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
const lineText = (lines) => lines.map(plain).filter(Boolean).join("\n");
const item = (id, label, options) => {
  const result = { id: String(id), label: plain(label) };
  if (options?.length) {
    result.options = options;
    if (options.every((option) => typeof option.value === "number")) {
      result.min = Math.min(...options.map((option) => option.value));
      result.max = Math.max(...options.map((option) => option.value));
    }
  }
  return result;
};
const section = (id, title, items) => ({ id, title: plain(title), items });

function beforeKey(text) {
  return text.split(/^###\s+[^\n]*Ключ\s*\(/m)[0];
}
function body(text) {
  const match = /^###\s+[^\n]*Содержание[^\n]*$/m.exec(text);
  assert.ok(match, "Не найден раздел содержания");
  return beforeKey(text).slice(match.index + match[0].length);
}
function tables(text) {
  const result = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*\|/.test(lines[index])) continue;
    const start = index;
    const rows = [];
    while (index < lines.length && /^\s*\|/.test(lines[index])) {
      const cells = lines[index]
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map(plain);
      if (!cells.every((cell) => /^:?-+:?$/.test(cell))) rows.push(cells);
      index++;
    }
    assert.ok(rows.length >= 2, "Неполная таблица");
    assert.ok(
      rows.every((row) => row.length === rows[0].length),
      "Неодинаковое число колонок",
    );
    result.push({ header: rows[0], rows: rows.slice(1), start, end: index });
  }
  return result;
}
function numericOptions(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*[*-]\s+\*\*(\d+)\*\*\s*(?:❑|[–—-])\s*(.*)$/.exec(line);
    return match ? [{ value: Number(match[1]), label: plain(match[2]) }] : [];
  });
}
function checkOptions(text) {
  return text
    .split("❑")
    .slice(1)
    .map((part) => {
      const label = plain(part.replace(/\s*[|/]\s*$/, ""));
      const coded = /^(\d+):\s*(.*)$/.exec(label);
      return coded
        ? { value: Number(coded[1]), label: coded[2] }
        : { value: label, label };
    });
}
function numberedBlocks(text, marker = /^\*\*(\d+[a-z]?)[.)]\s+.+$/gm) {
  const matches = [...text.matchAll(marker)];
  return matches.map((match, index) => ({
    id: match[1],
    heading: plain(match[0]),
    text: text.slice(
      match.index + match[0].length,
      matches[index + 1]?.index ?? text.length,
    ),
  }));
}
function tableOptions(header, common) {
  return header.map((cell) => {
    const numbered = /^(.*?)\s*\((\d+)\)$/.exec(cell);
    if (numbered)
      return { value: Number(numbered[2]), label: numbered[1].trim() };
    if (/^\d+$/.test(cell)) {
      const found = common.find((option) => option.value === Number(cell));
      assert.ok(found, `Не найдена подпись варианта ${cell}`);
      return found;
    }
    return { value: cell, label: cell };
  });
}
function tableItems(table, common = [], prefix = "") {
  const options = tableOptions(table.header.slice(2), common);
  return table.rows.map((row) => {
    assert.match(row[0], /^\d+$/, "Ожидался номер пункта");
    assert.ok(
      row.slice(2).every((cell) => cell === "❑"),
      "Неожиданная ячейка ответа",
    );
    return item(`${prefix}${row[0]}`, row[1], options);
  });
}
function sharedTable(text) {
  const contents = body(text);
  const found = tables(contents);
  assert.equal(found.length, 1);
  const common = numericOptions(
    beforeKey(text).split(/^###\s+[^\n]*Содержание/m)[0],
  );
  return [
    section(
      "main",
      /^###\s+[^\n]*Содержание[^\n]*$/m.exec(text)[0],
      tableItems(found[0], common),
    ),
  ];
}
function pairedTables(text, sourceId) {
  const contents = beforeKey(text);
  const parts = [
    ...contents.matchAll(/^(?:####\s*)?\*\*Часть\s+(\d+)\.[^\n]+$/gm),
  ];
  assert.equal(parts.length, 2);
  return parts.map((match, index) => {
    const slice = contents.slice(
      match.index + match[0].length,
      parts[index + 1]?.index ?? contents.length,
    );
    const found = tables(slice);
    assert.equal(found.length, 1);
    const id =
      sourceId === "S29"
        ? ["trait", "state"][index]
        : ["state", "trait"][index];
    return section(
      id,
      match[0],
      tableItems(found[0], [], sourceId === "S29" ? `${id}.` : ""),
    );
  });
}
function clinician(text, warnings) {
  const blocks = numberedBlocks(body(text));
  const items = [];
  for (const block of blocks) {
    const options = numericOptions(block.text);
    assert.ok(options.length, `Нет вариантов у пункта ${block.id}`);
    items.push(item(block.id, block.heading, options));
    if (options.some((option) => !option.label))
      warnings.push(
        `Пункт ${block.id}: у промежуточных вариантов нет подписей в исходнике; пустые подписи сохранены.`,
      );
    const range = /от\s+(\d+)\s+до\s+(\d+)/.exec(block.heading);
    if (
      range &&
      (Number(range[1]) !== items.at(-1).min ||
        Number(range[2]) !== items.at(-1).max)
    )
      warnings.push(
        `Пункт ${block.id}: диапазон в заголовке не совпадает с перечисленными вариантами; варианты не исправлены.`,
      );
    const extra = block.text.split(/\r?\n/).filter((line) => /_+/.test(line));
    for (const [index, prompt] of extra.entries())
      items.push(item(`${block.id}.note${index + 1}`, prompt));
  }
  return [
    section("main", /^###\s+[^\n]*Содержание[^\n]*$/m.exec(text)[0], items),
  ];
}
function hcl(text, warnings) {
  return numberedBlocks(body(text)).map((block) => {
    let items;
    if (block.id === "3") {
      const found = tables(block.text);
      if (found.length) items = tableItems(found[0]);
      else
        items = block.text.split(/\r?\n/).flatMap((line) => {
          const match = /^(\d+)\.\s+(❑.+?)\s+[—–]\s+(.+)$/.exec(line);
          return match
            ? [item(match[1], match[3], checkOptions(match[2]))]
            : [];
        });
    } else if (block.id === "4") {
      const found = tables(block.text);
      if (found.length) {
        const options = tableOptions(found[0].header.slice(1), []);
        items = found[0].rows.map((row, index) =>
          item(`context.4.${index + 1}`, row[0], options),
        );
      } else
        items = block.text.split(/\r?\n/).flatMap((line) => {
          const match = /^\*\s+\*\*(.+?):\*\*\s+(❑.*)$/.exec(line);
          return match
            ? [item("context.4", match[1], checkOptions(match[2]))]
            : [];
        });
      items.forEach((entry, index) => {
        entry.id = `context.4.${index + 1}`;
      });
    } else {
      const options = block.text
        .split(/\r?\n/)
        .filter((line) => line.includes("❑"))
        .flatMap(checkOptions);
      const extra = block.text.split(/\r?\n/).filter((line) => /_+/.test(line));
      items = [
        item(
          `context.${block.id}`,
          [block.heading, ...extra].join("\n"),
          options,
        ),
      ];
    }
    assert.ok(items.length, `Пустая часть HCL ${block.id}`);
    if (block.id === "8")
      warnings.push(
        "Поле длительности оставлено открытым: числовые границы в исходнике не заданы.",
      );
    return section(block.id, block.heading, items);
  });
}
function cssrs(text, warnings) {
  const contents = body(text);
  const parts = [...contents.matchAll(/^####\s+\*\*([IVX]+)\.[^\n]+$/gm)];
  assert.equal(parts.length, 4);
  warnings.push(
    "Ветвления интервью и временные периоды требуют отдельного утверждения; автоматическая маршрутизация и оценка риска не реализованы.",
  );
  warnings.push(
    "Ненумерованные варианты интенсивности сохранены строками; дополнительные ответы не получили выдуманных числовых кодов.",
  );
  return parts.map((part, index) => {
    const slice = contents.slice(
      part.index + part[0].length,
      parts[index + 1]?.index ?? contents.length,
    );
    const blocks =
      part[1] === "I"
        ? numberedBlocks(slice)
        : numberedBlocks(slice, /^\*\s+\*\*(.+?)\*\*[^\n]*$/gm);
    const items = [];
    for (const [blockIndex, block] of blocks.entries()) {
      const id = `${part[1]}.${blockIndex + 1}`;
      const lines = block.text.split(/\r?\n/);
      const options = lines
        .filter((line) => line.includes("❑"))
        .flatMap(checkOptions);
      const description = lines.filter(
        (line) =>
          !line.includes("❑") && !/_+/.test(line) && !/^\s*---/.test(line),
      );
      items.push(
        item(
          id,
          [block.heading.replace(/^\*\s*/, ""), lineText(description)]
            .filter(Boolean)
            .join("\n"),
          options,
        ),
      );
      const extras = lines.filter((line) => /_+/.test(line));
      extras.forEach((line, extraIndex) =>
        items.push(item(`${id}.note${extraIndex + 1}`, line)),
      );
    }
    return section(part[1], part[0], items);
  });
}
function cgi(text, warnings) {
  const blocks = numberedBlocks(beforeKey(text));
  assert.equal(blocks.length, 3);
  warnings.push(
    "CGI-S: исходный MD содержит редакторское восстановление нумерации и пустую содержательную подпись последнего варианта. Это не подтверждённая версия CGI-S; варианты не исправлены.",
  );
  warnings.push(
    "Три раздела CGI независимы. Суммирование и клиническая интерпретация не реализованы.",
  );
  return blocks.map((block, index) => {
    const found = tables(block.text);
    assert.equal(found.length, 1);
    const table = found[0];
    const id = ["CGI-S", "CGI-I", "GI"][index];
    let options;
    if (index < 2)
      options = table.rows.map((row) => {
        assert.match(row[0], /^\d+$/);
        return { value: Number(row[0]), label: row[1] };
      });
    else {
      options = table.rows.flatMap((row) =>
        row.slice(1).map((value, col) => {
          assert.match(value, /^\d+$/);
          return {
            value: Number(value),
            label: `${row[0]}\n${table.header[col + 1]}`,
          };
        }),
      );
      const noScore = /\(Примечание:\s*(\d+)\s*[–—-]\s*([^)]*)\)/.exec(
        plain(block.text),
      );
      if (noScore)
        options.unshift({
          value: Number(noScore[1]),
          label: noScore[2].trim(),
        });
    }
    const description = block.text
      .split(/\r?\n/)
      .slice(0, table.start)
      .filter((line) => !/^\s*---/.test(line));
    return section(id, block.heading, [
      item(
        block.id,
        [block.heading, lineText(description)].join("\n"),
        options,
      ),
    ]);
  });
}
function lsas(text, warnings) {
  const anchors = tables(beforeKey(text).split(/^###\s+[^\n]*Содержание/m)[0]);
  assert.equal(anchors.length, 1);
  const questionTable = tables(body(text))[0];
  warnings.push(
    "Сохранена нумерация вариантов 1–4 именно из предоставленного MD. Другие версии и ключи не подставлялись.",
  );
  return ["fear", "avoidance"].map((id, col) => {
    const options = anchors[0].rows.map((row) => ({
      value: Number(row[0]),
      label: row[col + 1],
    }));
    return section(
      id,
      anchors[0].header[col + 1],
      questionTable.rows.map((row) => item(`${id}.${row[0]}`, row[1], options)),
    );
  });
}
function scl(text) {
  const options = numericOptions(
    beforeKey(text).split(/^###\s+[^\n]*Содержание/m)[0],
  );
  const items = body(text)
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(\d+)\.\s+(.+)$/.exec(line);
      return match ? [item(match[1], match[2], options)] : [];
    });
  return [
    section("main", /^###\s+[^\n]*Содержание[^\n]*$/m.exec(text)[0], items),
  ];
}

function kopLayout(text, warnings) {
  // Поддерживается layout-текст первых двух страниц: слева вопрос, справа
  // шесть колонок. Границы колонок определяются по напечатанным цифрам 1…6,
  // а не по содержанию или медицинским предположениям.
  const pages = text.split(/^===== PDF PAGE \d+ =====\s*$/m).slice(1, 3);
  assert.equal(
    pages.length,
    2,
    "S38: нужны маркеры PDF PAGE и layout первых двух страниц",
  );
  const questions = new Map();
  const answers = [];
  for (const page of pages) {
    const lines = page.split(/\r?\n/);
    const anchorLine = lines.find((line) =>
      /\s1\s+2\s+3\s+4\s+5\s+6\s*$/.test(line),
    );
    assert.ok(anchorLine, "S38: не найдены шесть числовых колонок");
    const positions = [...anchorLine.matchAll(/\d+/g)]
      .slice(-6)
      .map((match) => match.index);
    const boundaries = [
      positions[0] - Math.floor((positions[1] - positions[0]) / 2),
      ...positions
        .slice(1)
        .map((position, index) => Math.ceil((positions[index] + position) / 2)),
      Infinity,
    ];
    let current;
    let started = false;
    let optionLines = Array.from({ length: 6 }, () => []);
    for (const line of lines) {
      if (/^\s*http|^\s*©/.test(line)) break;
      const left = line.slice(0, boundaries[0]).trim();
      const question = /^(\d{1,2})\.\s+(.+)$/.exec(left);
      if (question) {
        current = question[1];
        assert.ok(!questions.has(current), "S38: повтор номера вопроса");
        questions.set(current, [question[2]]);
        started = true;
      } else if (started && left) questions.get(current).push(left);
      if (!started) continue;
      const numeric = /\s1\s+2\s+3\s+4\s+5\s+6\s*$/.test(line);
      if (numeric) {
        answers.push(
          optionLines.map((parts, index) => ({
            value: index + 1,
            label: parts.join(" ").replace(/\s+/g, " ").trim(),
          })),
        );
        optionLines = Array.from({ length: 6 }, () => []);
      } else
        for (let col = 0; col < 6; col++) {
          const value = line.slice(boundaries[col], boundaries[col + 1]).trim();
          if (value) optionLines[col].push(value);
        }
    }
  }
  assert.equal(questions.size, 25, "S38: извлечено не 25 вопросов");
  assert.equal(answers.length, 25, "S38: извлечено не 25 групп ответов");
  const items = [...questions].map(([id, lines], index) =>
    item(id, lines.join(" "), answers[index]),
  );
  assert.ok(
    items.every((entry) => entry.options.every((option) => option.label)),
    "S38: пустой вариант после извлечения колонок",
  );
  const title = pages[0]
    .split(/\r?\n/)
    .slice(0, 5)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  warnings.push(
    "Извлечение КОП-25 зависит от layout-текста с маркерами страниц; необходима сверка переносов и колонок с PDF. Текстовый вход сам по себе не подтверждает тождество PDF.",
  );
  warnings.push(
    "Анкетные поля пола, возраста, роста, веса и ФИО не включены в вопросы КОП-25. Формулы обработки не перенесены.",
  );
  return { title, sections: [section("main", title, items)] };
}

const expectedCounts = {
  S21: [42, 41],
  S22: [11, 11],
  S23: [7, 7],
  S24: [46, 45],
  S25: [25, 17],
  S26: [34, 17],
  S27: [20, 10],
  S28: [14, 14],
  S29: [30, 30],
  S30: [12, 12],
  S31: [40, 40],
  S32: [90, 90],
  S33: [15, 15],
  S34: [3, 3],
  S35: [35, 35],
  S36: [48, 48],
  S37: [21, 21],
  S38: [25, 25],
};
function validate(form) {
  const ids = new Set();
  assert.equal(
    new Set(form.sections.map((part) => part.id)).size,
    form.sections.length,
    `${form.sourceId}: повтор раздела`,
  );
  for (const part of form.sections) {
    assert.ok(
      part.id && part.title && part.items.length,
      `${form.sourceId}: пустой раздел`,
    );
    for (const entry of part.items) {
      assert.ok(
        entry.id && entry.label && !ids.has(entry.id),
        `${form.sourceId}: пустой/повторный пункт ${entry.id}`,
      );
      ids.add(entry.id);
      if (entry.options) {
        assert.equal(
          new Set(entry.options.map((option) => option.value)).size,
          entry.options.length,
          `${form.sourceId}: повтор варианта ${entry.id}`,
        );
        assert.ok(
          entry.options.every(
            (option) =>
              typeof option.label === "string" &&
              ((typeof option.value === "number" &&
                Number.isFinite(option.value)) ||
                (typeof option.value === "string" && option.value.length > 0)),
          ),
        );
      }
    }
  }
  const items = form.sections.flatMap((part) => part.items);
  const choices = items.filter((entry) => entry.options?.length).length;
  if (items.length)
    assert.deepEqual(
      [items.length, choices],
      expectedCounts[form.sourceId],
      `${form.sourceId}: изменилось число пунктов; требуется повторная проверка источника`,
    );
  return {
    sourceId: form.sourceId,
    sourceHash: form.sourceHash,
    sections: form.sections.length,
    items: items.length,
    choiceItems: choices,
    openItems: items.length - choices,
    warnings: form.warnings,
  };
}

async function writePrivateJson(name, value) {
  const destination = path.join(output, name);
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await fs.rename(temporary, destination);
}

function parseMarkdown(sourceId, text, warnings) {
  const title = /^\*\*Название на русском языке:\*\*\s*(.+)$/m
    .exec(text)?.[1]
    ?.trim();
  assert.ok(title, `${sourceId}: нет названия формы`);
  let sections;
  if (["S21", "S24"].includes(sourceId)) sections = hcl(text, warnings);
  else if (["S22", "S26", "S27", "S28"].includes(sourceId))
    sections = clinician(text, warnings);
  else if (["S29", "S31"].includes(sourceId))
    sections = pairedTables(text, sourceId);
  else if (sourceId === "S25") sections = cssrs(text, warnings);
  else if (sourceId === "S34") sections = cgi(text, warnings);
  else if (sourceId === "S36") sections = lsas(text, warnings);
  else if (sourceId === "S32") sections = scl(text);
  else sections = sharedTable(text);
  if (sourceId === "S21")
    warnings.push(
      "Во вводном описании число вариантов второй части не совпадает с самим бланком; извлечены четыре фактически перечисленных варианта.",
    );
  if (sourceId === "S22")
    warnings.push(
      "Инструкция допускает промежуточные баллы, которым не даны отдельные подписи. Извлечены только явно перечисленные варианты; диапазон min/max не разрешает добавлять отсутствующие варианты.",
    );
  if (sourceId === "S24")
    warnings.push(
      "Исходный MD отмечает отсутствие исходного ключа и предлагает дополнительный алгоритм. Такой алгоритм не перенесён и не считается утверждённым.",
    );
  if (sourceId === "S29")
    warnings.push(
      "Таблицы вспомогательных коэффициентов в MD описаны, но не приведены полностью; они не восстанавливались.",
    );
  if (sourceId === "S31")
    warnings.push(
      "Для обеих частей сохранены подписи частоты из данного MD; требуется сверка формулировок ситуативной версии с утверждаемым бланком.",
    );
  if (sourceId === "S37")
    warnings.push(
      "Библиографическая запись в MD содержит признаки смешения источников для тревоги и депрессии; требуется проверка происхождения версии.",
    );
  return { title, sections };
}

function selfTest() {
  const synthetic =
    "### Содержание (Шаблон оценки)\n\n**1. Учебный пункт**\n* **0** ❑ Первый\n* **1** ❑ \n* **2** ❑ Третий\n*(Основание: ___)*\n\n### Ключ (Интерпретация результатов)\n**2. Не является вопросом**";
  const warnings = [];
  const parsed = clinician(synthetic, warnings);
  assert.equal(parsed[0].items.length, 2);
  assert.equal(parsed[0].items[0].options[1].label, "");
  assert.equal(warnings.length, 1);
  assert.deepEqual(checkOptions("❑ Да | ❑ Нет"), [
    { value: "Да", label: "Да" },
    { value: "Нет", label: "Нет" },
  ]);
  assert.deepEqual(checkOptions("❑ 0: Первый  ❑ 2: Второй"), [
    { value: 0, label: "Первый" },
    { value: 2, label: "Второй" },
  ]);
  const table = tables(
    "| № | Пункт | Никогда (1) | Часто (2) |\n| :--- | --- | ---: | --- |\n| 1 | Синтетический текст | ❑ | ❑ |",
  )[0];
  assert.deepEqual(tableItems(table)[0].options, [
    { value: 1, label: "Никогда" },
    { value: 2, label: "Часто" },
  ]);
  assert.throws(() => tables("| a | b |\n| --- | --- |\n| c |"), /колонок/);
  const multiple = numberedBlocks(
    "**6a) Первый вопрос**\n* ❑ Один | ❑ Два\n\n**6b) Второй вопрос**\n* ❑ Три | ❑ Четыре\n",
  );
  assert.deepEqual(
    multiple.map((block) => block.id),
    ["6a", "6b"],
  );
  assert.deepEqual(
    multiple.map((block) => checkOptions(block.text).length),
    [2, 2],
  );
  assert.throws(
    () => tableOptions(["0", "1"], [{ value: 0, label: "Первый" }]),
    /подпись/,
  );
  console.log(
    "PASS: синтетические проверки парсера (таблицы, коды, пустые подписи, граница ключа)",
  );
}

if (args["self-test"]) {
  selfTest();
} else {
  const sourceRoot = args["source-dir"] ?? process.env.DOCTOR_SOURCE_DIR;
  assert.ok(
    sourceRoot,
    "Укажите --source-dir или DOCTOR_SOURCE_DIR; исходники в Git не поставляются",
  );
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, "docs/specifications/doctor-web/source-manifest.json"),
      "utf8",
    ),
  );
  const entries = manifest.filter((entry) =>
    /^S(?:2[1-9]|3[0-8])$/.test(entry.id),
  );
  assert.equal(entries.length, 18);
  const forms = [];
  for (const entry of entries) {
    const sourcePath = path.resolve(
      sourceRoot,
      ...entry.relative.split(/[\\/]/),
    );
    const relative = path.relative(path.resolve(sourceRoot), sourcePath);
    assert.ok(
      relative && !relative.startsWith("..") && !path.isAbsolute(relative),
      "Источник вне входной папки",
    );
    const bytes = await fs.readFile(sourcePath);
    assert.equal(
      hash(bytes),
      entry.sha256,
      `${entry.id}: SHA-256 не совпадает с manifest; обновление не разрешено автоматически`,
    );
    const warnings = [
      "Подготовительная форма для выбора и сверки врачом. Клиническое утверждение и активация отсутствуют.",
      "Значения options взяты из бланка; строковые значения не превращены в баллы. min/max описывают только перечисленные числовые варианты. Ключи, обратный скоринг, пороги, диагнозы и правила действий не активированы.",
      "Общая инструкция интервью и условия применимости не исполняются этой схемой; перед использованием необходимо сверить полный локальный источник.",
    ];
    let parsed;
    if (entry.id === "S38") {
      if (args["s38-text"]) {
        const extracted = await fs.readFile(args["s38-text"]);
        parsed = kopLayout(extracted.toString("utf8"), warnings);
        warnings.push(
          `SHA-256 дополнительного layout-текста: ${hash(extracted)}.`,
        );
      } else {
        parsed = {
          title: path.basename(entry.relative.replaceAll("\\", "/"), ".pdf"),
          sections: [],
        };
        warnings.push(
          "METADATA_ONLY: для вопросов КОП-25 требуется --s38-text с layout-текстом PDF и маркерами ===== PDF PAGE N =====; вопросы не были извлечены.",
        );
      }
    } else parsed = parseMarkdown(entry.id, bytes.toString("utf8"), warnings);
    const form = {
      sourceId: entry.id,
      sourceHash: entry.sha256,
      ...parsed,
      warnings,
    };
    validate(form);
    forms.push(form);
  }
  // До записи проверены ВСЕ источники, формат и количество элементов.
  await fs.mkdir(output, { recursive: true });
  const report = forms.map(validate);
  for (const form of forms)
    await writePrivateJson(`${form.sourceId}.json`, form);
  await writePrivateJson("report.json", {
    schemaVersion: 1,
    clinicalActivation: false,
    sources: report,
  });
  for (const row of report)
    console.log(
      `${row.sourceId}: sections=${row.sections}; items=${row.items}; choices=${row.choiceItems}; open=${row.openItems}; warnings=${row.warnings.length}`,
    );
  console.log(
    `Готово: ${forms.length} подготовительных форм в .cache/doctor-server/clinical-forms. Клиническая активация отсутствует.`,
  );
}
