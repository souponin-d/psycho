import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";

const [url, configPath, target] = process.argv.slice(2);
if (!url || !configPath || !target)
  throw new Error("URL PRIVATE_CONFIG OUTPUT_PREFIX required");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "ru-RU",
});
const page = await context.newPage();
page.setDefaultTimeout(25000);
const evidence = {
  utc: new Date().toISOString(),
  url,
  browser: browser.version(),
  viewport: "1440x1000",
  method: "navigation until visible heading; no human task timing",
  rows: [],
  page_errors: [],
};
page.on("pageerror", (e) => evidence.page_errors.push(e.name));
try {
  let started = performance.now();
  await page.goto(url);
  await page
    .getByLabel("Рабочая электронная почта", { exact: false })
    .waitFor();
  evidence.rows.push({
    operation: "cold-login-form",
    ms: performance.now() - started,
    ok: true,
  });
  await page
    .getByLabel("Рабочая электронная почта", { exact: false })
    .fill(config.doctorEmail);
  await page.getByLabel("Пароль", { exact: false }).fill(config.doctorPassword);
  started = performance.now();
  await page
    .getByRole("button", { name: "Войти в клинику", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Ваш рабочий день", exact: true })
    .waitFor();
  evidence.rows.push({
    operation: "login-to-workday",
    ms: performance.now() - started,
    ok: true,
  });
  const root = new URL(url);
  root.hash = "/patients";
  for (let n = 0; n < 30; n++) {
    started = performance.now();
    await page.goto(root.href);
    await page
      .getByRole("heading", { name: "Пациенты", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: /^Открыть карту:/ })
      .first()
      .waitFor();
    evidence.rows.push({
      operation: "patient-directory",
      ms: performance.now() - started,
      ok: true,
    });
    started = performance.now();
    const card = page.getByRole("button", { name: /^Открыть карту:/ }).first();
    const patientName = (await card.getAttribute("aria-label")).replace(
      "Открыть карту: ",
      "",
    );
    await card.click();
    await page
      .getByRole("heading", { name: patientName, exact: true })
      .waitFor();
    evidence.rows.push({
      operation: "open-chart",
      ms: performance.now() - started,
      ok: true,
    });
  }
  await page.screenshot({ path: target + ".png", fullPage: true });
} catch (error) {
  evidence.failure = {
    name: error.name,
    message: String(error.message).split("Call log:")[0].slice(0, 200),
  };
  evidence.failure.url = page.url();
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    target + ".json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await browser.close();
  console.log(
    JSON.stringify({
      url,
      observations: evidence.rows.length,
      failed: Boolean(evidence.failure),
    }),
  );
}
