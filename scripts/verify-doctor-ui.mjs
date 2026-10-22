import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Запуск: node scripts/verify-doctor-ui.mjs. Нужны запущенный doctor web и Chromium.
// DOCTOR_UI_MODE=demo|server|all; по умолчанию all при наличии локального конфига.
// Серверный сценарий создаёт только синтетическую карту в локальной тестовой БД.
const root = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = process.env.DOCTOR_WEB_URL ?? "http://127.0.0.1:8768";
const screenshotDir = path.join(root, ".cache", "doctor-screens");
const configPath = path.join(
  root,
  ".cache",
  "doctor-server",
  "local-config.json",
);
const config = await fs
  .readFile(configPath, "utf8")
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
const mode = process.env.DOCTOR_UI_MODE ?? (config ? "all" : "demo");
assert.ok(
  ["demo", "server", "all"].includes(mode),
  "DOCTOR_UI_MODE: demo, server или all",
);
const modes = mode === "all" ? ["demo", "server"] : [mode];
const secrets = [config?.doctorPassword, config?.databasePassword].filter(
  Boolean,
);
const redact = (value) =>
  secrets.reduce(
    (text, secret) => text.replaceAll(secret, "[скрыто]"),
    String(value),
  );
await fs.mkdir(screenshotDir, { recursive: true });

function localDateTime(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
const now = new Date();
now.setSeconds(0, 0);
const followupAt = localDateTime(new Date(now.getTime() + 7 * 86_400_000));
const firstMeasurementAt = localDateTime(
  new Date(now.getTime() - 7 * 86_400_000),
);
const runId = `${Date.now()}`;
const results = [];
const browser = await chromium.launch({
  headless: process.env.DOCTOR_UI_HEADED !== "1",
});

async function visible(locator) {
  await locator.waitFor({ state: "visible" });
}
async function focused(locator, message) {
  const handle = await locator.elementHandle();
  assert.ok(handle, message);
  await locator
    .page()
    .waitForFunction((element) => element === document.activeElement, handle);
  assert.ok(
    await locator.evaluate((element) => element === document.activeElement),
    message,
  );
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scroll <= dimensions.width + 1,
    `Горизонтальное переполнение: ${dimensions.scroll} > ${dimensions.width}`,
  );
}
async function screenshot(page, prefix, name) {
  await page.screenshot({
    path: path.join(screenshotDir, `${prefix}-${name}.png`),
    fullPage: true,
  });
}
function dialog(page, name) {
  return page.getByRole("dialog", { name, exact: true });
}
async function closeSaved(modal, button) {
  await modal.getByRole("button", { name: button, exact: true }).click();
  await modal.waitFor({ state: "hidden" });
}
async function patientTab(page, name) {
  const link = page
    .getByRole("navigation", { name: "Разделы карты", exact: true })
    .getByRole("link", { name, exact: true });
  await link.click();
  await page.waitForFunction(
    (element) => element.getAttribute("aria-current") === "page",
    await link.elementHandle(),
  );
}
async function saveVisit(page) {
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await visible(page.getByText("Черновик сохранён", { exact: true }));
}
async function addMeasurement(page, measuredAt, score) {
  await page
    .getByRole("button", { name: "Добавить оценку", exact: true })
    .click();
  const modal = dialog(page, "Добавить результат оценки");
  await modal
    .getByLabel("Форма и версия", { exact: false })
    .fill("Синтетическая форма UI v1");
  await modal
    .getByLabel("Источник результата", { exact: false })
    .fill("Синтетический бланк браузерной проверки");
  await modal
    .getByLabel("Дата и время оценки", { exact: false })
    .fill(measuredAt);
  await modal.getByLabel("Итоговый балл", { exact: false }).fill(String(score));
  await modal
    .getByLabel("Заключение / комментарий врача", { exact: false })
    .fill("Учебный результат без клинической интерпретации");
  await closeSaved(modal, "Сохранить результат");
}

async function scenario(currentMode) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ru-RU",
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  const apiFailures = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/") && response.status() >= 400)
      apiFailures.push({ path: url.pathname, status: response.status() });
  });
  const completed = [];
  let stage = "вход";
  const patientName = `Учебный Пациент UI ${currentMode} ${runId}`;
  const planTitle = "Синтетический контрольный контакт UI";
  const note = "Учебное сообщение: подготовить вопросы к следующему контакту.";
  const documentTitle = "Синтетическая выписка UI";
  async function step(name, operation) {
    stage = name;
    await operation();
    completed.push(name);
    console.log(`PASS ${currentMode}: ${name}`);
  }
  try {
    await step("вход", async () => {
      await page.goto(baseUrl);
      if (currentMode === "demo") {
        await page
          .getByRole("button", {
            name: "Открыть учебное рабочее место",
            exact: true,
          })
          .click();
      } else {
        assert.ok(
          config?.doctorPassword,
          "Для server нужен doctorPassword в локальном конфиге",
        );
        await page
          .getByLabel("Рабочая электронная почта", { exact: false })
          .fill("doctor@example.test");
        const password = page.getByLabel("Пароль", { exact: false });
        await visible(password);
        await password.fill(config.doctorPassword);
        await page
          .getByRole("button", { name: "Войти в клинику", exact: true })
          .click();
      }
      await visible(
        page.getByRole("heading", { name: "Ваш рабочий день", exact: true }),
      );
      await noOverflow(page);
      await screenshot(page, currentMode, "workday");
    });

    await step("новый пациент и профиль", async () => {
      await page
        .getByRole("button", { name: "Новый пациент", exact: true })
        .click();
      const create = dialog(page, "Новый пациент");
      await create
        .getByLabel("Фамилия, имя, отчество", { exact: false })
        .fill(patientName);
      await create
        .getByLabel("Дата рождения", { exact: false })
        .fill("1992-04-18");
      await closeSaved(create, "Создать карту");
      await visible(
        page.getByRole("heading", { name: patientName, exact: true }),
      );
      const opener = page.getByRole("button", { name: "Профиль", exact: true });
      await opener.click();
      const profile = dialog(page, "Профиль и контекст пациента");
      await focused(
        profile.getByRole("button", { name: "Закрыть", exact: true }),
        "Перед Escape профиль должен получить начальный фокус",
      );
      await page.keyboard.press("Escape");
      await profile.waitFor({ state: "hidden" });
      await focused(
        opener,
        "Закрытие профиля должно вернуть фокус кнопке Профиль",
      );
      await opener.click();
      await profile
        .getByLabel("Цели пациента", { exact: false })
        .fill("Учебная цель: подготовить вопросы к следующему приёму");
      await profile
        .getByLabel("Аллергии и непереносимость", { exact: false })
        .fill("Синтетические сведения для проверки интерфейса");
      // Проверяется настоящее событие submit на заполненной валидной форме.
      await profile.locator("form").evaluate((form) => {
        window.__doctorUiSourceSubmits = 0;
        form.addEventListener("submit", () => window.__doctorUiSourceSubmits++);
      });
      const sourceButton = profile.getByRole("button", { name: /^S01 ·/ });
      assert.equal(await sourceButton.getAttribute("type"), "button");
      await sourceButton.click();
      const source = dialog(page, "S01 · Паспорт источника");
      await visible(source);
      assert.equal(
        await page.evaluate(() => window.__doctorUiSourceSubmits),
        0,
        "Открытие источника не должно отправлять форму",
      );
      // Visibility precedes Radix's focus/layer effects. Send keyboard input
      // only after the nested dialog has taken focus, as a user would.
      await focused(
        source.getByRole("button", { name: "Закрыть", exact: true }),
        "Перед Escape паспорт должен получить начальный фокус",
      );
      await page.keyboard.press("Escape");
      await source.waitFor({ state: "hidden" });
      await visible(profile);
      await focused(
        sourceButton,
        "После источника фокус должен вернуться к его ссылке",
      );
      assert.equal(
        await profile
          .getByLabel("Цели пациента", { exact: false })
          .inputValue(),
        "Учебная цель: подготовить вопросы к следующему приёму",
      );
      await closeSaved(profile, "Сохранить профиль");
      await visible(
        page.getByText(
          "Учебная цель: подготовить вопросы к следующему приёму",
          { exact: true },
        ),
      );
    });

    await step("эпизод и согласие", async () => {
      await page.getByRole("button", { name: "Эпизод", exact: true }).click();
      const episode = dialog(page, "Новый эпизод");
      await episode
        .getByLabel("Название / повод наблюдения", { exact: false })
        .fill("Учебное наблюдение UI");
      await closeSaved(episode, "Сохранить эпизод");
      await page.getByRole("button", { name: "Запись", exact: true }).click();
      const consent = dialog(page, "Зафиксировать согласие или отказ");
      await consent
        .getByLabel("Номер / ссылка на документ", { exact: false })
        .fill(`UI-СОГЛАСИЕ-${runId}`);
      await consent
        .getByLabel("Содержание информирования", { exact: false })
        .fill(
          "Синтетическая запись о целях, методах и альтернативах для проверки формы.",
        );
      await closeSaved(consent, "Зафиксировать");
      await page.getByRole("button", { name: "Запись", exact: true }).click();
      const communication = dialog(page, "Зафиксировать согласие или отказ");
      await communication
        .getByLabel("Назначение документа", { exact: false })
        .selectOption("communication");
      await communication
        .getByLabel("Номер / ссылка на документ", { exact: false })
        .fill(`UI-СВЯЗЬ-${runId}`);
      await communication
        .getByLabel("Объём и адресат", { exact: false })
        .fill("Синтетический обмен сообщениями с лечащим врачом.");
      await communication
        .getByLabel("Содержание информирования", { exact: false })
        .fill(
          "Учебная запись о согласии на дистанционную связь; без реальной отправки.",
        );
      await closeSaved(communication, "Зафиксировать");
      await visible(page.getByText("Дистанционная связь", { exact: true }));
      await screenshot(page, currentMode, "patient");
    });

    let visitUrl;
    await step("создание и проведение приёма", async () => {
      await page
        .getByRole("button", { name: "Создать приём", exact: true })
        .click();
      const appointment = dialog(page, "Запланировать приём");
      await appointment
        .getByLabel("Дата и время", { exact: false })
        .fill(localDateTime(now));
      await appointment
        .getByLabel("Причина обращения / повестка", { exact: false })
        .fill("Синтетическая проверка рабочего места врача");
      await closeSaved(appointment, "Создать приём");
      await visible(
        page.getByRole("button", { name: "Начать приём", exact: true }),
      );
      visitUrl = page.url();
      await page
        .getByRole("button", { name: "Начать приём", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Начать приём", exact: true })
        .waitFor({ state: "hidden" });
      await page
        .getByLabel("Жалобы и причина обращения", { exact: false })
        .fill("Синтетическая жалоба для проверки сохранения");
      await page
        .getByLabel("История текущего состояния", { exact: false })
        .fill("Учебная запись; клиническое решение не моделируется.");
      await saveVisit(page);
      await page.getByRole("button", { name: /Оценка состояния/ }).click();
      await page
        .getByLabel("Заключение врача по безопасности", { exact: false })
        .fill("Синтетическая оценка безопасности для технического сценария.");
      await saveVisit(page);
      await addMeasurement(page, firstMeasurementAt, 6);
      await page.getByRole("button", { name: /Заключение и план/ }).click();
      await page
        .getByLabel("Заключение врача", { exact: false })
        .fill("Синтетическое заключение UI, внесённое врачом.");
      await page
        .getByLabel("Рекомендации и следующий шаг", { exact: false })
        .fill("Учебная договорённость о следующем контакте.");
      await page
        .getByLabel("Рекомендуемая дата следующего контакта", { exact: false })
        .fill(followupAt);
      await page
        .getByLabel("Обоснование решения / применимость источников", {
          exact: false,
        })
        .fill("Техническая проверка сохранения основания решения.");
      await saveVisit(page);
      await page.getByRole("button", { name: "Добавить", exact: true }).click();
      const plan = dialog(page, "Запись в плане ведения");
      await plan.getByLabel("Название", { exact: false }).fill(planTitle);
      await plan
        .getByLabel("Содержание назначения", { exact: false })
        .fill(
          "Проверить вопросы и согласовать следующий контакт в учебном сценарии.",
        );
      await plan
        .getByLabel("Указания пациенту", { exact: false })
        .fill("Подготовить список вопросов.");
      await plan
        .getByLabel("Обоснование решения врача", { exact: false })
        .fill("Синтетическая договорённость в проверке интерфейса.");
      await closeSaved(plan, "Сохранить черновик");
      await page
        .getByRole("button", { name: "Проверить и подтвердить", exact: true })
        .click();
      await closeSaved(
        dialog(page, "Подтвердить назначение"),
        "Подтверждаю решение",
      );
      await page.getByRole("button", { name: /Итог приёма/ }).click();
      await page
        .getByRole("button", { name: "Завершить приём", exact: true })
        .click();
      await closeSaved(
        dialog(page, "Подтвердить итог приёма"),
        "Подтвердить и завершить",
      );
      await visible(
        page.getByRole("heading", {
          name: "Подтверждение и дополнения",
          exact: true,
        }),
      );
      await screenshot(page, currentMode, "visit");
      await page.reload();
      await visible(
        page.getByRole("heading", {
          name: "Подтверждение и дополнения",
          exact: true,
        }),
      );
      await visible(
        page.getByText("Синтетическое заключение UI, внесённое врачом.", {
          exact: true,
        }),
      );
      await page.evaluate(() => {
        window.__doctorPrinted = false;
        window.print = () => {
          window.__doctorPrinted = true;
        };
      });
      await page.getByRole("button", { name: "Печать", exact: true }).click();
      await page.waitForFunction(() => window.__doctorPrinted === true);
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      assert.equal(
        await page.locator("details:not([open])").count(),
        0,
        "Печать должна раскрывать дополнительные поля приёма",
      );
      const pdf = await page.pdf({
        path: path.join(screenshotDir, `${currentMode}-visit.pdf`),
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
      });
      assert.ok(pdf.length > 1000, "Сформирована печатная копия приёма");
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    });

    await step("следующий приём и предыдущий план", async () => {
      await page
        .getByRole("button", {
          name: "Запланировать следующий приём",
          exact: true,
        })
        .click();
      const appointment = dialog(page, "Запланировать приём");
      assert.equal(
        await appointment
          .getByLabel("Дата и время", { exact: false })
          .inputValue(),
        followupAt,
        "Рекомендованное время должно подставляться в запись",
      );
      await closeSaved(appointment, "Создать приём");
      await visible(
        page.getByRole("button", { name: "Начать приём", exact: true }),
      );
      assert.notEqual(
        page.url(),
        visitUrl,
        "Следующий приём должен иметь отдельную запись",
      );
      await page.getByRole("button", { name: /Заключение и план/ }).click();
      await visible(
        page.getByRole("heading", { name: planTitle, exact: true }),
      );
      await page
        .getByRole("button", { name: "К истории пациента", exact: true })
        .click();
      await patientTab(page, "Обзор");
      await page
        .getByRole("button", { name: "Создать приём", exact: true })
        .click();
      const overlap = dialog(page, "Запланировать приём");
      await overlap
        .getByLabel("Дата и время", { exact: false })
        .fill(followupAt);
      await visible(
        overlap.getByText("Время пересекается с существующей записью", {
          exact: true,
        }),
      );
      await page.keyboard.press("Escape");
      await overlap.waitFor({ state: "hidden" });
    });

    await step("дневник и этапы обработки события", async () => {
      await patientTab(page, "Дневник");
      await page
        .getByRole("button", { name: "Записать со слов пациента", exact: true })
        .click();
      const report = dialog(page, "Запись со слов пациента");
      await report
        .getByLabel("Заметка / вопросы пациента", { exact: false })
        .fill("Синтетическая запись дневника UI");
      await report
        .getByLabel("Самочувствие · 0–10", { exact: false })
        .fill("7");
      await closeSaved(report, "Сохранить запись");
      await page
        .getByRole("button", { name: "Отметить просмотр", exact: true })
        .click();
      await visible(page.getByText("Просмотрено", { exact: true }));
      await patientTab(page, "События");
      await page
        .getByRole("button", { name: "Добавить событие", exact: true })
        .click();
      const event = dialog(page, "Новое событие");
      await event
        .getByLabel("Что требует внимания", { exact: false })
        .fill("Учебное событие UI");
      await event
        .getByLabel("Исходные сведения и причина", { exact: false })
        .fill("Синтетическая проверка последовательных этапов обработки.");
      await closeSaved(event, "Создать событие");
      const steps = [
        ["Получение и ответственный", "Принять в работу"],
        ["Клиническая оценка и её основание", "Зафиксировать оценку"],
        ["Какое действие выполнено", "Зафиксировать действие"],
        ["Результат и основание закрытия", "Закрыть с результатом"],
      ];
      for (const [label, action] of steps) {
        await page
          .getByRole("button", { name: "Разобрать событие", exact: true })
          .click();
        const review = dialog(page, "Обработка события");
        await review
          .getByLabel(label, { exact: false })
          .fill(`Синтетический этап: ${action}`);
        await closeSaved(review, action);
      }
      await visible(
        page.getByRole("heading", {
          name: "Открытых событий нет",
          exact: true,
        }),
      );
      await page
        .getByRole("button", { name: "Вся история", exact: true })
        .click();
      await visible(page.getByText("Закрыто", { exact: true }));
    });

    await step("сообщение и импорт документа", async () => {
      await patientTab(page, "Сообщения");
      await page.getByLabel("Сообщение пациенту", { exact: false }).fill(note);
      await page
        .getByRole("button", {
          name: currentMode === "server" ? "Отправить" : "Сохранить сообщение",
          exact: true,
        })
        .click();
      await visible(page.getByText(note, { exact: true }));
      await visible(page.getByText(/Сохранено, доставка не подтверждена/));
      await patientTab(page, "Документы");
      await page
        .getByRole("button", { name: "Добавить документ", exact: true })
        .click();
      const document = dialog(page, "Добавить исходный документ");
      await document
        .getByLabel("Название документа", { exact: false })
        .fill(documentTitle);
      await document
        .getByLabel("Автор / организация / источник", { exact: false })
        .fill("Синтетический источник браузерной проверки");
      const originalText =
        "Жалобы: Синтетическая запись для проверки импорта.\nРекомендации: Подготовить вопросы.";
      await document
        .getByLabel("Загрузить текстовый файл", { exact: false })
        .setInputFiles({
          name: "synthetic-ui.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(originalText, "utf8"),
        });
      const original = document.getByLabel("Текст оригинала", { exact: false });
      await page.waitForFunction(
        ({ element, expected }) => element.value === expected,
        { element: await original.elementHandle(), expected: originalText },
      );
      assert.equal(await original.inputValue(), originalText);
      await closeSaved(document, "Сохранить оригинал");
      await page
        .getByRole("button", { name: "Оригинал и факты", exact: true })
        .click();
      const facts = dialog(page, "Оригинал и проверка фактов");
      const boxes = facts.getByRole("checkbox", {
        name: "Проверено по оригиналу, контекст сохранён",
        exact: true,
      });
      assert.equal(
        await boxes.count(),
        2,
        "Импорт должен выделить два исходных фрагмента",
      );
      for (const checkbox of await boxes.all()) await checkbox.check();
      await closeSaved(facts, "Сохранить проверку");
      await visible(page.getByText("Факты проверены", { exact: true }));
      await page.reload();
      await visible(
        page.getByRole("heading", { name: documentTitle, exact: true }),
      );
      await visible(page.getByText("Факты проверены", { exact: true }));
      await patientTab(page, "Сообщения");
      await visible(page.getByText(note, { exact: true }));
    });

    await step("динамика и исходные значения", async () => {
      await patientTab(page, "Динамика");
      await addMeasurement(page, localDateTime(now), 4);
      const rows = page.getByRole("table").getByRole("row");
      assert.equal(
        await rows.count(),
        3,
        "Таблица динамики должна содержать два измерения",
      );
      await visible(page.getByRole("img", { name: /Динамика GAD-7/ }));
      await page
        .getByRole("button", { name: "Исходная запись", exact: true })
        .first()
        .click();
      const measurement = dialog(page, "Исходный результат оценки");
      await visible(
        measurement.getByText("Синтетическая форма UI v1", { exact: true }),
      );
      await page.keyboard.press("Escape");
      await measurement.waitFor({ state: "hidden" });
      await page.reload();
      await visible(
        page.getByRole("heading", { name: "Динамика состояния", exact: true }),
      );
      assert.equal(await page.getByRole("table").getByRole("row").count(), 3);
      await screenshot(page, currentMode, "dynamics");
      await noOverflow(page);
    });

    await step(
      "подготовительная форма шкалы, расчёт и сохранение",
      async () => {
        await page.getByLabel("Найти форму", { exact: true }).fill("S23");
        await page
          .getByRole("button", { name: /^Заполнить черновик:/ })
          .click();
        const form = page.getByRole("dialog", { name: /ГТР-7.*черновик/ });
        await visible(form);
        await form.getByRole("button", { name: "Далее", exact: true }).click();
        if (currentMode === "server") {
          const responses = form.getByRole("combobox");
          assert.equal(
            await responses.count(),
            7,
            "Точная серверная форма содержит 7 вопросов",
          );
          for (const response of await responses.all())
            await response.selectOption("1");
        } else {
          const responses = form.getByRole("spinbutton");
          assert.equal(
            await responses.count(),
            7,
            "Учебная форма позволяет внести 7 числовых ответов",
          );
          for (const response of await responses.all())
            await response.fill("1");
        }
        await form.getByRole("button", { name: "Далее", exact: true }).click();
        await screenshot(page, currentMode, "assessment-review");
        await closeSaved(form, "Сохранить черновик");
        await visible(
          page.getByRole("heading", {
            name: "Сохранённые черновики · 1",
            exact: true,
          }),
        );
        await page.reload();
        await page
          .getByRole("button", { name: /^Продолжить черновик:/ })
          .click();
        await visible(form);
        await form.getByRole("button", { name: "Далее", exact: true }).click();
        if (currentMode === "server") {
          for (const response of await form.getByRole("combobox").all())
            assert.equal(await response.inputValue(), "1");
        } else {
          for (const response of await form.getByRole("spinbutton").all())
            assert.equal(await response.inputValue(), "1");
        }
        await page.keyboard.press("Escape");
        await form.waitFor({ state: "hidden" });
        assert.equal(
          await page.getByRole("table").first().getByRole("row").count(),
          3,
          "Подготовительная форма не добавляется в клиническую динамику",
        );
      },
    );

    await step("мобильная навигация, клавиатура и reduced motion", async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const width of [390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        const opener = page.getByRole("button", {
          name: "Открыть навигацию",
          exact: true,
        });
        await visible(opener);
        assert.equal(
          await page.locator("aside").isVisible(),
          false,
          "Desktop sidebar должна быть скрыта на телефоне",
        );
        assert.equal(
          await page
            .getByRole("navigation", {
              name: "Основная навигация",
              exact: true,
            })
            .count(),
          0,
          "Закрытая навигация не должна присутствовать в accessibility tree",
        );
        await opener.focus();
        for (let index = 0; index < 10; index++) {
          await page.keyboard.press("Tab");
          assert.equal(
            await page.evaluate(
              () => !!document.activeElement?.closest("aside"),
            ),
            false,
            "Tab не должен попадать в скрытую боковую панель",
          );
        }
        await opener.click();
        const drawer = dialog(page, "Навигация");
        await visible(drawer);
        await drawer
          .getByRole("button", { name: "Рабочий день", exact: true })
          .focus();
        for (let index = 0; index < 10; index++) {
          await page.keyboard.press("Tab");
          assert.ok(
            await drawer.evaluate((element) =>
              element.contains(document.activeElement),
            ),
            "Фокус должен оставаться внутри открытого drawer",
          );
        }
        const motion = await drawer.evaluate((element) => ({
          animation: getComputedStyle(element).animationDuration,
          transition: getComputedStyle(element).transitionDuration,
        }));
        assert.ok(
          motion.animation
            .split(",")
            .every((duration) => parseFloat(duration) === 0),
          "Reduced motion должен отключать анимацию диалога",
        );
        assert.ok(
          motion.transition
            .split(",")
            .every((duration) => parseFloat(duration) === 0),
          "Reduced motion должен отключать переходы диалога",
        );
        await noOverflow(page);
        await screenshot(page, currentMode, `mobile-${width}-drawer`);
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        await focused(
          opener,
          "Escape должен вернуть фокус кнопке открытия навигации",
        );
        await noOverflow(page);
        await screenshot(page, currentMode, `mobile-${width}`);
      }
    });
    assert.deepEqual(
      errors,
      [],
      "В сценарии не должно быть необработанных ошибок JavaScript",
    );
    results.push({ mode: currentMode, passed: true, steps: completed });
  } catch (error) {
    await screenshot(page, currentMode, "failure").catch(() => {});
    results.push({
      mode: currentMode,
      passed: false,
      stage,
      steps: completed,
      error: redact(error.stack ?? error),
      pageErrors: errors.map(redact),
      apiFailures,
    });
    console.error(
      `FAIL ${currentMode}: ${stage}\n${redact(error.stack ?? error)}`,
    );
  } finally {
    await context.close();
  }
}

try {
  for (const currentMode of modes) await scenario(currentMode);
} finally {
  await browser.close();
}
await fs.writeFile(
  path.join(screenshotDir, "verification-result.json"),
  JSON.stringify(
    { when: new Date().toISOString(), baseUrl, results },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    screenshots: ".cache/doctor-screens",
  }),
);
if (results.some((result) => !result.passed)) process.exitCode = 1;
