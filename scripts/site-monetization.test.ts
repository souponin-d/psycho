// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mountMonetization } from "../site/monetization.js";

afterEach(() => {
  document.body.innerHTML = "";
});
function mount() {
  const source = readFileSync(resolve("site/index.html"), "utf8");
  const doc = new DOMParser().parseFromString(source, "text/html");
  document.body.innerHTML = doc.querySelector("[data-monetization]")!.outerHTML;
  const root = document.querySelector<HTMLElement>("[data-monetization]")!;
  mountMonetization(root);
  return root;
}
function compact(root: HTMLElement, selector: string) {
  return root.querySelector(selector)!.textContent!.replace(/\s/g, "");
}
it("меняет тарифы по периоду оплаты, сохраняя годовую основу оценки рынка", () => {
  const root = mount();
  expect(compact(root, '[data-plan="clinical"] [data-plan-price]')).toBe(
    "29900₽",
  );
  root.querySelector<HTMLButtonElement>('[data-billing="month"]')!.click();
  expect(compact(root, '[data-plan="screening"] [data-plan-price]')).toBe(
    "990₽",
  );
  expect(compact(root, '[data-plan="clinical"] [data-plan-price]')).toBe(
    "2990₽",
  );
  expect(compact(root, '[data-plan="clinic"] [data-plan-price]')).toBe(
    "14900₽",
  );
  expect(
    root.querySelector('[data-billing="month"]')!.getAttribute("aria-pressed"),
  ).toBe("true");
  expect(root.querySelector("[data-annual-revenue]")!.textContent).toBe("7,18");
  root.querySelector<HTMLButtonElement>('[data-billing="year"]')!.click();
  expect(compact(root, '[data-plan="screening"] [data-plan-price]')).toBe(
    "9900₽",
  );
  expect(compact(root, '[data-plan="clinical"] [data-plan-price]')).toBe(
    "29900₽",
  );
  expect(compact(root, '[data-plan="clinic"] [data-plan-price]')).toBe(
    "149000₽",
  );
});
it("синхронизирует SOM, ARR и эквивалент MRR по двум ползункам и формулам документа", () => {
  const root = mount();
  const clinics = root.querySelector<HTMLInputElement>(
    "#monetization-clinics",
  )!;
  const doctors = root.querySelector<HTMLInputElement>(
    "#monetization-doctors",
  )!;
  expect(clinics.disabled || doctors.disabled).toBe(false);
  expect(root.querySelector("[data-annual-revenue]")!.textContent).toBe("7,18");
  expect(compact(root, "[data-monthly-revenue]")).toBe("598000");
  expect(compact(root, "[data-seats]")).toBe("240");
  for (const [c, d, arr, mrr, seats] of [
    [10, 1, "0,3", "24917", "10"],
    [45, 6, "8,07", "672750", "270"],
    [40, 10, "11,96", "996667", "400"],
    [100, 20, "59,8", "4983333", "2000"],
  ] as const) {
    clinics.value = String(c);
    doctors.value = String(d);
    doctors.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector("[data-annual-revenue]")!.textContent).toBe(arr);
    expect(compact(root, "[data-monthly-revenue]")).toBe(mrr);
    expect(compact(root, "[data-seats]")).toBe(seats);
    expect(root.querySelector("[data-som-revenue]")!.textContent).toBe(
      `${arr} млн ₽`,
    );
    const filled = [
      ...root.querySelectorAll<HTMLElement>('[data-market="som"] .is-filled'),
    ].reduce(
      (sum, cell) =>
        sum + parseFloat(cell.style.getPropertyValue("--cell-fill")) / 100,
      0,
    );
    expect(filled).toBeCloseTo(((c * d * 29900) / 1161374100) * 40);
  }
  expect(root.querySelectorAll('[data-market="tam"] .is-filled')).toHaveLength(
    40,
  );
  const sam = [
    ...root.querySelectorAll<HTMLElement>('[data-market="sam"] .is-filled'),
  ].reduce(
    (sum, cell) =>
      sum + parseFloat(cell.style.getPropertyValue("--cell-fill")) / 100,
    0,
  );
  expect(sam).toBeCloseTo((138245640 / 1161374100) * 40);
});
