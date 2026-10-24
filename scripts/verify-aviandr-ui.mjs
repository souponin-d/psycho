import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Requires a local doctor web/API. Uses synthetic data and no external requests.
const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.DOCTOR_WEB_URL ?? "http://127.0.0.1:8768";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const cfg = JSON.parse(
  await fs.readFile(
    process.env.DOCTOR_LOCAL_CONFIG ??
      path.join(root, ".cache/doctor-server/local-config.json"),
    "utf8",
  ),
);
const out = path.join(root, "docs/verification/assets/aviandr-plan");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const mode of ["demo", "server"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    let id = "demo-patient-1";
    if (mode === "demo")
      await page
        .getByRole("button", { name: "Открыть учебное рабочее место" })
        .click();
    else {
      await page
        .getByLabel(/^Рабочая электронная почта/)
        .fill("doctor@example.test");
      await page.getByLabel(/^Пароль/).fill(cfg.doctorPassword);
      await page
        .getByRole("button", { name: "Войти в клинику", exact: true })
        .click();
    }
    await page
      .getByRole("heading", { name: "Ваш рабочий день", exact: true })
      .waitFor();
    if (mode === "server") {
      const session = await (
        await page.request.get(base + "/api/session")
      ).json();
      const response = await page.request.post(base + "/api/patients", {
        headers: { "X-CSRF-TOKEN": session.csrfToken },
        data: {
          id: crypto.randomUUID(),
          profile: {
            name: "Синтетический сценарий Авиандра",
            birthDate: "1992-04-18",
            allergies: "Сведения для технической проверки",
            currentMedication: "Лекарственный анамнез требует уточнения",
          },
        },
      });
      assert.equal(response.status(), 201);
      id = (await response.json()).id;
      await page.reload();
      await page
        .getByRole("heading", { name: "Ваш рабочий день", exact: true })
        .waitFor();
    }
    await page.goto(`${base}/#/patients/${id}/plan`);
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    const modal = page.getByRole("dialog", {
      name: "Запись в плане ведения",
      exact: true,
    });
    await modal
      .getByRole("combobox", { name: "Тип назначения", exact: true })
      .selectOption("medication");
    await modal
      .getByRole("button", { name: "Выбрать Авиандр", exact: true })
      .click();
    await modal.getByText("Уточнить данные проверки", { exact: true }).click();
    await modal
      .getByRole("combobox", { name: "Эпилепсия", exact: true })
      .selectOption("yes");
    await modal
      .getByLabel(/^Основание уточнений/)
      .fill("Синтетический сценарий. Со слов пациента на приёме.");
    await modal.getByLabel("Дозировка", { exact: true }).fill("20 мг");
    await modal
      .getByLabel("Режим приёма", { exact: true })
      .fill("Синтетическая запись врача");
    await modal
      .getByLabel("Указания пациенту", { exact: true })
      .fill("Учебная проверка интерфейса");
    await modal
      .getByLabel(/^Обоснование решения врача/)
      .fill("Технический сценарий, правила не утверждены");
    await modal.getByText("Уточнить данные проверки", { exact: true }).click();
    await modal.getByText(/Результаты и основания/).click();
    for (const [name, width, height] of [
      ["desktop", 1280, 800],
      ["mobile", 375, 812],
    ]) {
      await page.setViewportSize({ width, height });
      await modal
        .getByLabel("Результаты проверки Авиандра", { exact: true })
        .scrollIntoViewIfNeeded();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.ok(
        await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      await page.screenshot({ path: path.join(out, `${mode}-${name}.png`) });
    }
    await modal
      .getByRole("button", { name: "Сохранить черновик", exact: true })
      .click();
    await modal.waitFor({ state: "hidden" });
    await page.reload();
    await page
      .getByRole("button", { name: "Редактировать", exact: true })
      .click();
    await modal.getByText("Уточнить данные проверки", { exact: true }).click();
    assert.equal(
      await modal
        .getByRole("combobox", { name: "Эпилепсия", exact: true })
        .inputValue(),
      "yes",
    );
    await modal.getByRole("button", { name: "Отмена", exact: true }).click();
    await page
      .getByRole("button", { name: "Проверить и подтвердить", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Подтвердить назначение",
      exact: true,
    });
    await confirmation.getByText("Не утверждено", { exact: true }).waitFor();
    await confirmation
      .getByRole("button", { name: "Подтверждаю решение", exact: true })
      .click();
    await confirmation.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${mode}: выбор → уточнения → сохранение/reload → ручное подтверждение; desktop/mobile без переполнения`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
