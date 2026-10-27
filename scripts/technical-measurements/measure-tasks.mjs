// Automated task timing/counts. Does not impersonate human participants or estimate reading time.
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
const [url, privatePath, output] = process.argv.slice(2);
const config = JSON.parse(await fs.readFile(privatePath, "utf8"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "ru-RU",
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const evidence = {
  utc: new Date().toISOString(),
  url,
  method: "automated happy-path task execution, not human usability study",
  action_unit: "one click or one field fill; typing/reading/thinking excluded",
  rows: [],
};
try {
  await page.goto(url);
  await page
    .getByLabel("Рабочая электронная почта", { exact: false })
    .fill(config.doctorEmail);
  await page.getByLabel("Пароль", { exact: false }).fill(config.doctorPassword);
  await page
    .getByRole("button", { name: "Войти в клинику", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Ваш рабочий день", exact: true })
    .waitFor();
  const target = await page.evaluate(async (id) => {
    const response = await fetch("/api/patients");
    const records = await response.json();
    const record = id
      ? records.find((r) => r.id === id)
      : records.find((r) => /синтетическ/iu.test(r.profile.name));
    return record ? { id: record.id, name: record.profile.name } : null;
  }, config.patientId ?? null);
  if (!target || !/синтетическ/iu.test(target.name))
    throw new Error("An explicitly synthetic card is required");
  const base = new URL(url);
  const prepare = async (tab = "overview") => {
    base.hash = `/patients/${target.id}/${tab}`;
    await page.goto(base.href);
    if (tab === "messages")
      await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: target.name, exact: true })
      .waitFor();
  };
  for (const task of (
    process.env.MEASURE_TASKS ??
    "find-card,view-dynamics,open-messages,send-message"
  ).split(",")) {
    for (let repeat = 0; repeat < 10; repeat++) {
      await prepare(task === "send-message" ? "messages" : "overview");
      let actions = 0;
      const click = async (locator) => {
        actions++;
        await locator.click();
      };
      const fill = async (locator, value) => {
        actions++;
        await locator.fill(value);
      };
      const start = performance.now();
      try {
        if (task === "find-card") {
          await click(
            page
              .getByRole("navigation", { name: "Основная навигация" })
              .getByRole("button", { name: "Пациенты", exact: true }),
          );
          await fill(
            page.getByRole("textbox", { name: "Поиск пациента", exact: true }),
            target.name,
          );
          await click(
            page.getByRole("button", {
              name: "Открыть карту: " + target.name,
              exact: true,
            }),
          );
          await page
            .getByRole("heading", { name: target.name, exact: true })
            .waitFor();
        } else if (task === "view-dynamics" || task === "open-messages") {
          await click(
            page
              .getByRole("navigation", { name: "Разделы карты" })
              .getByRole("link", { name: /Наблюдение/ }),
          );
          if (task === "view-dynamics") {
            await page
              .getByRole("heading", { name: "Динамика состояния", exact: true })
              .waitFor();
          } else {
            await click(
              page
                .getByRole("navigation", { name: "Разделы наблюдения" })
                .getByRole("link", { name: "Сообщения", exact: true }),
            );
            await page
              .getByRole("heading", { name: "Сообщения", exact: true })
              .waitFor();
          }
        } else {
          const text = `Синтетический автоматический замер #58 ${Date.now()}-${repeat}`;
          await fill(
            page.getByLabel("Сообщение пациенту", { exact: false }),
            text,
          );
          const reply = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname.endsWith("/commands") &&
              response.request().method() === "POST",
          );
          await click(
            page.getByRole("button", { name: "Отправить", exact: true }),
          );
          const response = await reply;
          if (!response.ok())
            throw new Error(`UnexpectedHTTP${response.status()}`);
          await page.getByText(text, { exact: true }).waitFor();
        }
        evidence.rows.push({
          task,
          repeat,
          ok: true,
          actions,
          ms: performance.now() - start,
        });
      } catch (error) {
        process.exitCode = 1;
        evidence.rows.push({
          task,
          repeat,
          ok: false,
          actions,
          ms: performance.now() - start,
          error: error.name,
          error_stage: String(error.message).split("\n")[0],
          ...(error.message.startsWith("UnexpectedHTTP")
            ? { http_error: error.message }
            : {}),
        });
        break;
      }
    }
  }
} catch (error) {
  evidence.failure = error.name;
  process.exitCode = 1;
} finally {
  await fs.writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
  await browser.close();
  console.log(
    JSON.stringify({
      observations: evidence.rows.length,
      failed: evidence.rows.filter((r) => !r.ok).length,
      failure: evidence.failure,
    }),
  );
}
