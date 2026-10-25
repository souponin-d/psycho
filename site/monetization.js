// Pricing hypothesis and market model from syncli_market_and_unit_economics_2026.docx.
// SAM accessibility (40%) and the third-year SOM are scenarios, not observed sales.
const SPECIALISTS = 10_239 + 1_320;
const THERAPISTS = 82_400;
const CLINICAL_ANNUAL_PRICE = 29_900;
const SCREENING_ANNUAL_PRICE = 9_900;
const TAM =
  SPECIALISTS * CLINICAL_ANNUAL_PRICE + THERAPISTS * SCREENING_ANNUAL_PRICE;
const SAM = SPECIALISTS * 0.4 * CLINICAL_ANNUAL_PRICE;
const PLANS = {
  screening: { month: 990, year: 9900 },
  clinical: { month: 2990, year: 29900 },
  clinic: { month: 14900, year: 149000 },
};
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function mountMonetization(root) {
  if (!root) return;
  const find = (selector) => root.querySelector(selector);
  const clinicsRange = find("#monetization-clinics");
  const doctorsRange = find("#monetization-doctors");
  const bars = [...root.querySelectorAll(".monetization-bar")];
  const forecast = find(".monetization-forecast");
  const somBar = find('[data-market="som"]');
  const billingButtons = [...root.querySelectorAll("[data-billing]")];

  function createCells(element) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 40; i++) {
      const cell = document.createElement("i");
      cell.style.setProperty("--cell-delay", `${80 + i * 32}ms`);
      fragment.append(cell);
    }
    element.replaceChildren(fragment);
  }
  function fill(element, ratio) {
    [...element.children].forEach((cell, index) => {
      const fraction = Math.max(0, Math.min(1, ratio * 40 - index));
      cell.classList.toggle("is-filled", fraction > 0);
      cell.style.setProperty("--cell-fill", `${fraction * 100}%`);
    });
  }
  bars.forEach(createCells);
  fill(find('[data-market="tam"]'), 1);
  fill(find('[data-market="sam"]'), SAM / TAM);

  function updateMarket() {
    const clinics = Number(clinicsRange.value);
    const doctors = Number(doctorsRange.value);
    const seats = clinics * doctors;
    const annualRevenue = seats * CLINICAL_ANNUAL_PRICE;
    const annualMillions = number.format(annualRevenue / 1_000_000);
    find("[data-annual-revenue]").textContent = annualMillions;
    find("[data-monthly-revenue]").textContent = money.format(
      annualRevenue / 12,
    );
    find("[data-seats]").textContent = money.format(seats);
    find("[data-som-revenue]").textContent = `${annualMillions} млн ₽`;
    find("[data-formula-clinics]").textContent = money.format(clinics);
    find("[data-formula-doctors]").textContent = money.format(doctors);
    find("[data-clinics-output]").textContent = money.format(clinics);
    find("[data-doctors-output]").textContent = money.format(doctors);
    fill(somBar, annualRevenue / TAM);
  }

  function updateBilling(period) {
    for (const button of billingButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.billing === period),
      );
    }
    for (const plan of root.querySelectorAll("[data-plan]")) {
      const price = plan.querySelector("[data-plan-price]");
      price.textContent = `${money.format(PLANS[plan.dataset.plan][period])} ₽`;
      const unit = plan.dataset.plan === "clinic" ? "за команду" : "за врача";
      plan.querySelector("[data-plan-unit]").textContent =
        `${unit} в ${period === "year" ? "год" : "месяц"}`;
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        price.animate?.([{ opacity: 0.3 }, { opacity: 1 }], { duration: 180 });
      }
    }
  }
  for (const range of [clinicsRange, doctorsRange]) {
    range.disabled = false;
    range.addEventListener("input", () => {
      forecast.setAttribute("data-interacting", "");
      updateMarket();
    });
  }
  for (const button of billingButtons) {
    button.disabled = false;
    button.addEventListener("click", () =>
      updateBilling(button.dataset.billing),
    );
  }
  updateMarket();
}
