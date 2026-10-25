// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mountMonetization } from "../site/monetization.js";

afterEach(() => {
  document.body.innerHTML = "";
});

it("согласованно меняет выручку, SOM и заполнение клеток при движении ползунка", () => {
  const source = readFileSync(resolve("site/index.html"), "utf8");
  const doc = new DOMParser().parseFromString(source, "text/html");
  document.body.innerHTML = doc.querySelector("[data-monetization]")!.outerHTML;
  const root = document.querySelector<HTMLElement>("[data-monetization]")!;
  mountMonetization(root);
  const range = root.querySelector<HTMLInputElement>("input[type=range]")!;
  expect(range.disabled).toBe(false);
  expect(root.querySelector("[data-annual-revenue]")!.textContent).toBe("4,8");
  expect(
    root.querySelectorAll("[data-revenue-mosaic] .is-filled"),
  ).toHaveLength(40);

  for (const [clinics, annual, monthly] of [
    [10, "1,2", "100000"],
    [45, "5,4", "450000"],
    [100, "12", "1000000"],
  ] as const) {
    range.value = String(clinics);
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector("[data-annual-revenue]")!.textContent).toBe(
      annual,
    );
    expect(
      root
        .querySelector("[data-monthly-revenue]")!
        .textContent!.replace(/\s/g, ""),
    ).toBe(monthly);
    expect(root.querySelector("[data-som-revenue]")!.textContent).toBe(
      `${annual} млн ₽`,
    );
    expect(root.querySelector("[data-formula-clinics]")!.textContent).toBe(
      String(clinics),
    );
    expect(
      root.querySelectorAll("[data-revenue-mosaic] .is-filled"),
    ).toHaveLength(clinics);
    // SOM remains a fraction of the first TAM-scaled cell, not a misleading full cell.
    const somCell = root.querySelector<HTMLElement>(
      "[data-som-bar] .is-filled",
    )!;
    expect(
      parseFloat(somCell.style.getPropertyValue("--cell-fill")),
    ).toBeCloseTo((clinics / 10000) * 40 * 100);
  }
  expect(
    root.querySelectorAll("[data-market-ratio='1'] .is-filled"),
  ).toHaveLength(40);
  expect(
    root.querySelectorAll("[data-market-ratio='0.2'] .is-filled"),
  ).toHaveLength(8);
  root.querySelector<HTMLButtonElement>("[data-monetization-replay]")!.click();
  expect(root.querySelectorAll("[data-interacting]")).toHaveLength(0);
  expect(root.querySelectorAll(".monetization-panel.is-visible")).toHaveLength(
    2,
  );
});
