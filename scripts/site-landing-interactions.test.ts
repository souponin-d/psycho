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

it("сохраняет вкладки продукта и показывает три мозаики опроса", async () => {
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
  const survey = within(
    document.querySelector<HTMLElement>(".audience-survey")!,
  );
  const mosaics = survey.getAllByRole("img");
  expect(mosaics).toHaveLength(3);
  for (const [index, count] of [46, 39, 31].entries()) {
    const mosaic = mosaics[index]!;
    expect(mosaic.getAttribute("aria-label")).toContain(`${count} из 107`);
    expect(mosaic.children).toHaveLength(107);
    expect(mosaic.querySelectorAll(".is-filled")).toHaveLength(count);
  }
  expect(survey.queryByRole("tablist")).toBeNull();

  expect(document.querySelector("#ecosystem-demo")).toBeNull();
  expect(document.querySelector(".clinical-showcase")).toBeNull();
  expect(document.querySelector(".care-journey")).toBeNull();
  expect(document.querySelector("dialog[open]")).toBeNull();
});
