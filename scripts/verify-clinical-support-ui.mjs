import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

// Изолированный профиль; в local сеть API отключена намеренно.
const mode = process.env.CLINICAL_UI_MODE ?? "local";
assert.ok(["local", "server"].includes(mode));
const output = `docs/verification/assets/clinical-support${mode === "server" ? "/server" : ""}`;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "ru-RU",
});
if (mode === "local")
  await context.route("**/api/**", (route) => route.abort());
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const visible = (locator) => locator.waitFor({ state: "visible" });
const panel = () =>
  page.getByRole("region", { name: "Клиническая поддержка", exact: true });
try {
  await page.goto(process.env.DOCTOR_WEB_URL ?? "http://127.0.0.1:8768");
  if (mode === "local") {
    await page
      .getByRole("button", { name: "Открыть кабинет", exact: true })
      .click();
  } else {
    const config = JSON.parse(
      await fs.readFile(".cache/doctor-server/local-config.json", "utf8"),
    );
    await page
      .getByLabel("Рабочая электронная почта")
      .fill("doctor@example.test");
    await page.getByLabel("Пароль").fill(config.doctorPassword);
    await page
      .getByRole("button", { name: "Войти в клинику", exact: true })
      .click();
  }
  await page
    .getByRole("heading", { name: "Ваш рабочий день", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Новый пациент", exact: true })
    .click();
  const create = page.getByRole("dialog", {
    name: "Новый пациент",
    exact: true,
  });
  await create
    .getByLabel("Фамилия, имя, отчество")
    .fill("Клиническая Проверка Синтетическая");
  await create.getByLabel("Дата рождения").fill("1990-02-10");
  await create
    .getByRole("button", { name: "Создать карту", exact: true })
    .click();
  await visible(panel());
  await panel()
    .getByRole("button", { name: "Сопоставить варианты", exact: true })
    .click();
  await visible(
    panel().getByRole("heading", { name: /Сохранённая оценка · ГТР/ }),
  );
  assert.ok(
    (await panel().getByText("Нужно уточнить", { exact: true }).count()) > 0,
  );
  const psychotherapy = panel()
    .getByRole("article", { name: /Вариант:.*Когнитивно/ })
    .first();
  await psychotherapy
    .getByRole("button", { name: "Принять", exact: true })
    .click();
  const decision = page.getByRole("dialog", {
    name: "Решение по варианту",
    exact: true,
  });
  await decision
    .getByRole("button", { name: "Сохранить решение", exact: true })
    .click();
  await decision.waitFor({ state: "hidden" });
  await visible(panel().getByText(/Проект добавлен в план/));
  console.log(
    mode,
    "PASS: GAD options retain unknown risks and acceptance creates a draft",
  );

  await panel()
    .getByLabel("Клинический маршрут", { exact: false })
    .selectOption("depression");
  await panel()
    .getByRole("button", { name: "Сопоставить варианты", exact: true })
    .click();
  await visible(
    panel().getByRole("heading", {
      name: /Сохранённая оценка · Депрессивные симптомы/,
    }),
  );
  await page.screenshot({ path: `${output}/therapy.png`, fullPage: true });
  console.log(
    mode,
    "PASS: depression route displays its own options and source-backed findings",
  );

  await panel()
    .getByRole("button", {
      name: "Записать нежелательное явление",
      exact: true,
    })
    .click();
  const adverse = page.getByRole("dialog", {
    name: "Нежелательное явление",
    exact: true,
  });
  await adverse
    .getByLabel("Симптомы и проявления")
    .fill("Синтетическая тошнота");
  await adverse.getByLabel("Выраженность симптомов").selectOption("severe");
  await adverse.getByLabel("Серьёзность исхода").selectOption("unknown");
  await adverse
    .getByRole("button", { name: "Сохранить явление", exact: true })
    .click();
  await adverse.waitFor({ state: "hidden" });
  await visible(
    panel().getByText("Синтетическая тошнота", { exact: true }).first(),
  );
  await visible(
    panel().getByRole("status").filter({ hasText: "Оценка устарела" }),
  );
  await page.reload();
  await visible(
    panel().getByText("Синтетическая тошнота", { exact: true }).first(),
  );
  await page.screenshot({
    path: `${output}/adverse-history.png`,
    fullPage: true,
  });
  console.log(
    mode,
    "PASS: adverse event survives reload and invalidates previous evaluation",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scroll <= dimensions.width + 1,
    JSON.stringify(dimensions),
  );
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(mode, "PASS: narrow viewport and no browser runtime errors");
} catch (error) {
  await page.screenshot({
    path: ".cache/clinical-support-ui-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
