import sourceData from "./source-data.json";

/** Source facts and draft arithmetic only. This catalog does not activate clinical rules. */
export interface AssessmentForm {
  id: string;
  title: string;
  sourceId: string;
  sourceHash: string;
  version: string;
  status: "unapproved";
  sourceStatus: "available" | "missing-source";
  assessor: "patient" | "clinician";
  window: string;
  /** Number of source items/situations; LSAS has two responses per situation. */
  itemCount: number | null;
  /** Bounds of a single total, or null when the form has no single total. */
  minimum: number | null;
  maximum: number | null;
  warnings: string[];
  calculation:
    "sum" | "mean" | "subscales" | "indices" | "formula" | "unsupported";
  /** Numeric inputs only. Interview/context fields remain in the private source form. */
  items: { key: string; minimum: number; maximum: number }[];
}

export interface AssessmentResult {
  /** All required arithmetic inputs are present; never denotes clinical approval. */
  complete: boolean;
  outputs: { label: string; value: number | null; maximum?: number }[];
  warnings: string[];
}

const unapproved =
  "Форма и расчёт не утверждены. Перед клиническим применением нужны проверка версии, прав использования и зафиксированное согласование клиницистом.";
const items = (count: number, minimum: number, maximum: number, prefix = "") =>
  Array.from({ length: count }, (_, index) => ({
    key: `${prefix}${index + 1}`,
    minimum,
    maximum,
  }));
const sourceForm = (
  id: string,
  metadata: Pick<
    AssessmentForm,
    | "assessor"
    | "window"
    | "itemCount"
    | "minimum"
    | "maximum"
    | "calculation"
    | "items"
    | "warnings"
  >,
): AssessmentForm => {
  const source = sourceData.find((entry) => entry.id === id);
  if (!source || !/^[a-f0-9]{64}$/.test(source.sha256))
    throw new Error(`Не найден проверяемый источник формы ${id}`);
  return {
    ...metadata,
    id,
    title: source.title,
    sourceId: id,
    sourceHash: source.sha256,
    version: `source-${source.sha256.slice(0, 12)}-draft-1`,
    status: "unapproved",
    sourceStatus: "available",
    warnings: [unapproved, ...metadata.warnings],
  };
};

export const assessmentCatalog: AssessmentForm[] = [
  sourceForm("S21", {
    assessor: "patient",
    window: "Ретроспективно: периоды повышенной активности в течение жизни",
    itemCount: 32,
    minimum: 0,
    maximum: 32,
    calculation: "sum",
    items: items(32, 0, 1),
    warnings: [
      "Расчёт охватывает 32 ответа «Да/Нет» раздела 3; контекстные разделы не входят в сумму. В описании расходится число разделов и характеристик. Перевод и полноту формы необходимо сверить.",
    ],
  }),
  sourceForm("S22", {
    assessor: "clinician",
    window: "Последние 48 часов и наблюдение при интервью",
    itemCount: 11,
    minimum: 0,
    maximum: 60,
    calculation: "sum",
    items: items(11, 0, 4).map((item) => ({
      ...item,
      maximum: ["5", "6", "8", "9"].includes(item.key) ? 8 : 4,
    })),
    warnings: [
      "Пункт 7: заголовок указывает 0–8, варианты ответов — 0–4; вводная относит двойной вес только к пунктам 5, 6, 8, 9. Доступна лишь сырая сумма по перечисленным вариантам, согласованный итог YMRS недоступен.",
    ],
  }),
  sourceForm("S23", {
    assessor: "patient",
    window: "Последние 2 недели",
    itemCount: 7,
    minimum: 0,
    maximum: 21,
    calculation: "sum",
    items: items(7, 0, 3),
    warnings: [
      "Формулировки и русскую адаптацию необходимо сверить; исследование общей популяции не заменяет проверку диагностических свойств в клинической выборке.",
    ],
  }),
  sourceForm("S24", {
    assessor: "patient",
    window: "Ретроспективно: периоды повышенной активности в течение жизни",
    itemCount: 33,
    minimum: 0,
    maximum: 33,
    calculation: "sum",
    items: items(33, 0, 1),
    warnings: [
      "В локальном источнике отсутствует исходный ключ. Показано только описательное количество ответов «Да» в 33 пунктах раздела 3; редакционный совет и исследовательские пороги не применяются. Контекстные разделы не входят в подсчёт.",
    ],
  }),
  sourceForm("S25", {
    assessor: "clinician",
    window:
      "Период наблюдения и анамнез; точные окна и версия в локальной форме не установлены",
    itemCount: null,
    minimum: null,
    maximum: null,
    calculation: "unsupported",
    items: [],
    warnings: [
      "Ветвящееся интервью сохраняется без автоматического суммарного балла и без классификации риска. Версия, перевод, временные окна и коды дополнительных ответов интенсивности не определены однозначно; арифметика недоступна.",
    ],
  }),
  sourceForm("S26", {
    assessor: "clinician",
    window:
      "Предшествующая неделя; пункты 8 и 9 — во время интервью, пункт 16 — перед эпизодом",
    itemCount: 17,
    minimum: 0,
    maximum: 52,
    calculation: "sum",
    items: items(17, 0, 4).map((item) => ({
      ...item,
      maximum: ["4", "5", "6", "12", "13", "14", "16", "17"].includes(item.key)
        ? 2
        : 4,
    })),
    warnings: [
      "Основание оценки сохраняется отдельно для каждого пункта. Локальная таблица интерпретации содержит пробел; категории тяжести не рассчитываются.",
    ],
  }),
  sourceForm("S27", {
    assessor: "clinician",
    window: "Временное окно в локальной форме не задано",
    itemCount: 10,
    minimum: 0,
    maximum: 60,
    calculation: "sum",
    items: items(10, 0, 6),
    warnings: [
      "Клиническое интервью; промежуточные оценки 1, 3 и 5 прямо разрешены источником, хотя отдельные словесные якоря для них не приведены.",
    ],
  }),
  sourceForm("S28", {
    assessor: "clinician",
    window:
      "Повседневные проявления и наблюдение при осмотре; единое окно не задано",
    itemCount: 14,
    minimum: 0,
    maximum: 56,
    calculation: "subscales",
    items: items(14, 0, 4),
    warnings: [
      "Локальный ключ делит пункты на первые 6 и оставшиеся 8. Именно это деление воспроизводится; группировку необходимо сверить с выбранной версией. Форма заполняется специалистом по интервью и наблюдению.",
    ],
  }),
  sourceForm("S29", {
    assessor: "patient",
    window:
      "СТ-Л: последнее время, например последний год; СТ-С: сейчас, сегодня",
    itemCount: 30,
    minimum: null,
    maximum: null,
    calculation: "subscales",
    items: [...items(15, 0, 3, "trait."), ...items(15, 0, 3, "state.")],
    warnings: [
      "Доступны две независимые сырые суммы 0–45. Весовые коэффициенты пяти субшкал отсутствуют: вместо них стоят шаблоны; субшкалы и стандартизованные оценки недоступны. Общая сумма двух форм не рассчитывается.",
    ],
  }),
  sourceForm("S30", {
    assessor: "patient",
    window: "Обычное самоописание; фиксированное временное окно не задано",
    itemCount: 12,
    minimum: 12,
    maximum: 60,
    calculation: "sum",
    items: items(12, 1, 5),
    warnings: [
      "В локальном варианте все формулировки прямые и указан простой подсчёт суммы. Версии BFNE/BFNE-R в источнике смешаны; обратные пункты из другой версии не подставляются.",
    ],
  }),
  sourceForm("S31", {
    assessor: "patient",
    window: "Пункты 1–20: сейчас; пункты 21–40: обычно",
    itemCount: 40,
    minimum: null,
    maximum: null,
    calculation: "subscales",
    items: items(40, 1, 4),
    warnings: [
      "Направление пунктов 13, 15 и 33 противоречит тексту локального ключа. Ниже приведены только результаты буквального спорного ключа: знак пунктов не исправлялся по догадке. Обе подшкалы требуют согласования.",
    ],
  }),
  sourceForm("S32", {
    assessor: "patient",
    window: "Последняя неделя, включая сегодняшний день",
    itemCount: 90,
    minimum: null,
    maximum: null,
    calculation: "indices",
    items: items(90, 0, 4),
    warnings: [
      "Для DEP заявлены 13 пунктов, но перечислены 12; DEP не вычисляется. Остальные субшкалы используют явно перечисленные пункты. Пропуски не уменьшают знаменатель; при PSI=0 PDSI не определён.",
    ],
  }),
  sourceForm("S33", {
    assessor: "patient",
    window: "Типичное поведение и самоописание; фиксированное окно не задано",
    itemCount: 15,
    minimum: null,
    maximum: null,
    calculation: "mean",
    items: items(15, 1, 4),
    warnings: [
      "Средние выводятся без округления и категорий: в локальной интерпретации есть разрывы границ и не задано правило округления.",
    ],
  }),
  sourceForm("S34", {
    assessor: "clinician",
    window:
      "Текущее состояние; изменение относительно исходного; эффект лечения",
    itemCount: 3,
    minimum: null,
    maximum: null,
    calculation: "subscales",
    items: [
      { key: "1", minimum: 0, maximum: 7 },
      { key: "2", minimum: 0, maximum: 7 },
      { key: "3", minimum: 0, maximum: 16 },
    ],
    warnings: [
      "CGI-S: нумерация и якоря противоречат друг другу, согласованная оценка недоступна; отдельно показан введённый код. CGI-I и выбранная клетка матрицы GI сохраняются отдельно. Код 0 означает отсутствие оценки. Общего балла CGI нет.",
    ],
  }),
  sourceForm("S35", {
    assessor: "patient",
    window: "Последняя неделя",
    itemCount: 35,
    minimum: 0,
    maximum: 140,
    calculation: "sum",
    items: items(35, 0, 4),
    warnings: [
      "Вычисляется только сумма локальных 35 ответов; перевод, точную версию и права использования необходимо согласовать.",
    ],
  }),
  sourceForm("S36", {
    assessor: "patient",
    window: "Последняя неделя, включая сегодняшний день",
    itemCount: 24,
    minimum: 48,
    maximum: 192,
    calculation: "subscales",
    items: [...items(24, 1, 4, "fear."), ...items(24, 1, 4, "avoidance.")],
    warnings: [
      "24 ситуации, по два ответа. Локальное кодирование 1–4 сохранено без преобразования в 0–3; сумма 48–192. Ключ распределения по четырём субшкалам отсутствует. Вариант самоотчёта, кодирование и пересекающиеся пороги требуют сверки; категории не рассчитываются.",
    ],
  }),
  sourceForm("S37", {
    assessor: "patient",
    window: "Последняя неделя, включая сегодняшний день",
    itemCount: 21,
    minimum: 0,
    maximum: 63,
    calculation: "sum",
    items: items(21, 0, 3),
    warnings: [
      "Библиографическая ссылка в локальном файле относится к шкале депрессии Beck 1961, а не к BAI 1988. Русскую адаптацию и источник необходимо уточнить.",
    ],
  }),
  sourceForm("S38", {
    assessor: "patient",
    window:
      "Текущие оценки важности и готовности; фиксированный ретроспективный период не задан",
    itemCount: 25,
    minimum: null,
    maximum: null,
    calculation: "formula",
    items: items(25, 1, 6),
    warnings: [
      "Формулы и группы пунктов сверены по изображению страницы 4 локального PDF. Процентные показатели отражают ответы о важности и готовности, а не объективную долю принятых доз; категории и рекомендации не рассчитываются.",
    ],
  }),
  {
    id: "PHQ-9",
    title: "PHQ-9 — источник не предоставлен",
    sourceId: "",
    sourceHash: "",
    version: "missing-source",
    status: "unapproved",
    sourceStatus: "missing-source",
    assessor: "patient",
    window: "Не подтверждено предоставленным источником",
    itemCount: 9,
    minimum: null,
    maximum: null,
    calculation: "unsupported",
    items: [],
    warnings: [
      unapproved,
      "Полная форма PHQ-9 и её ключ не предоставлены. Ввод и расчёт недоступны до получения и проверки источника.",
    ],
  },
];

const numbers = (values: number[]) => values.map(String);
const sequence = (first: number, last: number, prefix = "") =>
  Array.from(
    { length: last - first + 1 },
    (_, index) => `${prefix}${first + index}`,
  );

/** Missing inputs never become zero; this function only returns draft arithmetic. */
export function calculateAssessment(
  formId: string,
  responses: Record<string, number | string | null>,
): AssessmentResult {
  const form = assessmentCatalog.find((entry) => entry.id === formId);
  if (!form) throw new Error(`Неизвестная форма: ${formId}`);
  if (!responses || typeof responses !== "object" || Array.isArray(responses))
    throw new Error("Ответы должны быть объектом с ключами пунктов");
  const keys = new Set(form.items.map((item) => item.key));
  for (const key of Object.keys(responses))
    if (!keys.has(key))
      throw new Error(`Неизвестный пункт ${key} формы ${formId}`);

  const warnings = [...form.warnings];
  if (form.calculation === "unsupported")
    return {
      complete: false,
      outputs: [{ label: "Расчёт недоступен", value: null }],
      warnings,
    };
  const values: Record<string, number | null> = {};
  for (const item of form.items) {
    const raw = responses[item.key];
    if (
      !Object.hasOwn(responses, item.key) ||
      raw === null ||
      (typeof raw === "string" && raw.trim() === "")
    ) {
      values[item.key] = null;
      continue;
    }
    // HCL source responses remain strings in saved drafts; only count affirmative answers.
    const binary =
      (formId === "S21" || formId === "S24") && (raw === "Да" || raw === "Нет");
    const value = binary
      ? raw === "Да"
        ? 1
        : 0
      : typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^-?\d+$/.test(raw.trim())
          ? Number(raw.trim())
          : NaN;
    if (
      !Number.isSafeInteger(value) ||
      value < item.minimum ||
      value > item.maximum
    )
      throw new Error(
        `Форма ${formId}, пункт ${item.key}: требуется целое значение ${item.minimum}–${item.maximum}`,
      );
    values[item.key] = value;
  }
  const missing = form.items
    .filter((item) => values[item.key] === null)
    .map((item) => item.key);
  let complete = missing.length === 0;
  if (!complete)
    warnings.push(
      `Не заполнены пункты: ${missing.join(", ")}. Зависимые результаты не рассчитаны.`,
    );
  const sum = (selected: string[] = [...keys]): number | null => {
    const entries = selected.map((key) => values[key]);
    return entries.some((value) => value == null)
      ? null
      : (entries as number[]).reduce((total, value) => total + value, 0);
  };
  const mean = (selected: string[]) => {
    const total = sum(selected);
    return total === null ? null : total / selected.length;
  };
  const outputs: AssessmentResult["outputs"] = [];
  const add = (label: string, value: number | null, maximum?: number) => {
    outputs.push({
      label,
      value,
      ...(maximum === undefined ? {} : { maximum }),
    });
  };

  switch (formId) {
    case "S21":
    case "S24":
      add("Число ответов «Да» (описательный подсчёт)", sum(), form.maximum!);
      break;
    case "S22":
      add("Сырая сумма по вариантам ответов локальной формы", sum(), 60);
      add("Согласованный итог YMRS", null);
      break;
    case "S28":
      add("Сумма", sum(), 56);
      add("Психическая тревога — по локальному ключу", sum(sequence(1, 6)), 24);
      add(
        "Соматическая тревога — по локальному ключу",
        sum(sequence(7, 14)),
        32,
      );
      break;
    case "S29":
      add("СТ-Л — сырая сумма", sum(sequence(1, 15, "trait.")), 45);
      add("СТ-С — сырая сумма", sum(sequence(1, 15, "state.")), 45);
      add("Взвешенные субшкалы — коэффициенты отсутствуют", null);
      break;
    case "S31": {
      const keyed = (direct: number[], reverse: number[], constant: number) => {
        const positive = sum(numbers(direct)),
          negative = sum(numbers(reverse));
        return positive === null || negative === null
          ? null
          : positive - negative + constant;
      };
      add(
        "СТ — по локальному спорному ключу",
        keyed(
          [3, 4, 6, 7, 9, 12, 14, 15, 17, 18],
          [1, 2, 5, 8, 10, 11, 13, 16, 19, 20],
          50,
        ),
        80,
      );
      add(
        "ЛТ — по локальному спорному ключу",
        keyed(
          [22, 23, 24, 25, 28, 29, 31, 32, 34, 35, 37, 38, 40],
          [21, 26, 27, 30, 33, 36, 39],
          35,
        ),
        80,
      );
      break;
    }
    case "S32": {
      const subscales: [string, number[]][] = [
        ["SOM", [1, 4, 12, 27, 40, 42, 48, 49, 52, 53, 56, 58]],
        ["O-C", [3, 9, 10, 28, 38, 45, 46, 51, 55, 65]],
        ["INT", [6, 21, 34, 36, 37, 41, 61, 69, 73]],
        ["ANX", [2, 17, 23, 33, 39, 57, 72, 78, 80, 86]],
        ["HOS", [11, 24, 63, 67, 74, 81]],
        ["PHOB", [13, 25, 47, 50, 70, 75, 82]],
        ["PAR", [8, 18, 43, 68, 76, 83]],
        ["PSY", [7, 16, 35, 62, 77, 84, 85, 87, 88, 90]],
      ];
      for (const [label, group] of subscales)
        add(label, mean(numbers(group)), 4);
      add("DEP — ключ не согласован", null);
      add(
        "Дополнительные пункты — сумма",
        sum(numbers([19, 44, 59, 60, 64, 66, 89])),
        28,
      );
      const total = sum();
      const positiveCount = complete
        ? Object.values(values).filter((value) => value! > 0).length
        : null;
      add("Сумма 90 ответов", total, 360);
      add("GSI", total === null ? null : total / 90, 4);
      add("PSI", positiveCount, 90);
      add(
        "PDSI",
        total === null || positiveCount === null || positiveCount === 0
          ? null
          : total / positiveCount,
        4,
      );
      if (positiveCount === 0)
        warnings.push(
          "PDSI не определён: нулевой знаменатель PSI; отсутствие положительных ответов не заменяется значением PDSI=0.",
        );
      break;
    }
    case "S33":
      add("Сумма", sum(), 60);
      add("Среднее по 15 пунктам", mean([...keys]), 4);
      add(
        "Социальное реагирование — сумма",
        sum(numbers([1, 3, 4, 5, 9, 11, 12, 13, 15])),
        36,
      );
      add("Самовосприятие — сумма", sum(numbers([2, 6, 7, 8, 10, 14])), 24);
      add(
        "Социальное реагирование — среднее",
        mean(numbers([1, 3, 4, 5, 9, 11, 12, 13, 15])),
        4,
      );
      add("Самовосприятие — среднее", mean(numbers([2, 6, 7, 8, 10, 14])), 4);
      break;
    case "S34":
      add("CGI-S — согласованная оценка недоступна", null);
      add(
        "CGI-S — введённый код, противоречивые якоря",
        values["1"] || null,
        7,
      );
      add("CGI-I — введённая оценка", values["2"] || null, 7);
      add("GI — выбранная клетка матрицы", values["3"] || null, 16);
      if (Object.values(values).includes(0)) {
        complete = false;
        warnings.push(
          "CGI: код 0 означает, что компонент не поддаётся оценке; это не нулевой балл.",
        );
      }
      break;
    case "S36":
      add("Сумма по локальному кодированию 1–4", sum(), 192);
      add("Страх — сумма", sum(sequence(1, 24, "fear.")), 96);
      add("Избегание — сумма", sum(sequence(1, 24, "avoidance.")), 96);
      add("Четыре субшкалы — ключ отсутствует", null);
      break;
    case "S38": {
      const groups: [string, number[]][] = [
        ["Md", [2, 3, 4, 6, 14]],
        ["Mm", [1, 5, 10, 11, 13]],
        ["Mc", [7, 8, 9, 12, 15]],
        ["Gd", [16, 17, 18, 20, 21]],
        ["Gm", [16, 19, 20, 24, 25]],
        ["Gc", [19, 22, 23, 24, 25]],
      ];
      const technical = groups.map(([label, group]) => {
        const value = sum(numbers(group));
        add(label, value, 30);
        return value;
      });
      // PDF p4: 1 / (((30 / M) * (60 / G)) / 2) * 100 = M * G / 9.
      const percent = (m: number | null, g: number | null) =>
        m === null || g === null ? null : (m * g) / 9;
      const cd = percent(technical[0] ?? null, technical[3] ?? null);
      const cm = percent(technical[1] ?? null, technical[4] ?? null);
      const cc = percent(technical[2] ?? null, technical[5] ?? null);
      add("Cd — лекарственная терапия, %", cd, 100);
      add("Cm — медицинское сопровождение, %", cm, 100);
      add("Cc — изменение образа жизни, %", cc, 100);
      add(
        "C — интегральный показатель, %",
        cd === null || cm === null || cc === null
          ? null
          : (cm + 2 * cc + 3 * cd) / 6,
        100,
      );
      break;
    }
    default:
      add("Сумма", sum(), form.maximum!);
  }
  return { complete, outputs, warnings };
}
