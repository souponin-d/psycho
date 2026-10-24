// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { within } from "@testing-library/react";

vi.mock("../site/hero-animation.js", () => ({ mountHeroAnimation: vi.fn() }));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("js-ready");
});

it("сохраняет вкладки продукта и карусель после сокращения лендинга", async () => {
  vi.useFakeTimers();
  const source = readFileSync(resolve("site/index.html"), "utf8");
  document.body.innerHTML = new DOMParser().parseFromString(
    source,
    "text/html",
  ).body.innerHTML;
  await import("../site/app.js");

  const product = within(document.querySelector<HTMLElement>("#ecosystem")!);
  const productLink =
    document.querySelector<HTMLAnchorElement>("#platform-link")!;
  product.getByRole("tab", { name: "Пациенту" }).click();
  expect(productLink.hidden).toBe(true);
  const patientDemo = product.getByRole("button", {
    name: "Посмотреть приложение пациента",
  });
  expect(patientDemo).toHaveProperty("disabled", true);

  product
    .getByRole("tab", { name: "Пациенту" })
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  expect(
    product.getByRole("tab", { name: "Клинике" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(productLink.getAttribute("href")).toBe("demo/admin/");
  expect(
    product.getByRole("heading", {
      name: "Эффективное управление клиникой на основе данных",
    }),
  ).toBeTruthy();
  product.getByRole("tab", { name: "Врачу" }).click();
  expect(productLink.getAttribute("href")).toBe("doctor/");

  expect(document.querySelector("#evidence")!.tagName).toBe("SECTION");
  expect(document.querySelector("#compare")!.closest("details")).toBeNull();
  const survey = within(document.querySelector<HTMLElement>(".survey-panel")!);
  survey.getByRole("button", { name: "Следующий вид графика" }).click();
  expect(
    document.querySelector("#survey-chart")!.getAttribute("aria-labelledby"),
  ).toBe("chart-bars");
  survey
    .getByRole("tab", { name: "Полосы" })
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  expect(document.querySelectorAll(".survey-mosaic i")).toHaveLength(240);
  expect(document.querySelectorAll(".survey-mosaic .filled")).toHaveLength(180);
  survey.getByRole("button", { name: "Следующий вид графика" }).click();
  expect(
    survey.getByRole("tab", { name: "Кольца" }).getAttribute("aria-selected"),
  ).toBe("true");
  survey.getByRole("button", { name: "Предыдущий вид графика" }).click();
  expect(
    survey.getByRole("tab", { name: "Мозаика" }).getAttribute("aria-selected"),
  ).toBe("true");

  expect(document.querySelector("#ecosystem-demo")).toBeNull();
  expect(document.querySelector(".clinical-showcase")).toBeNull();
  expect(document.querySelector(".care-journey")).toBeNull();
  expect(document.querySelector("dialog[open]")).toBeNull();
});
