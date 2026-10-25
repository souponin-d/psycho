// Illustrative commercial model, not market research or an active tariff.
const MONTHLY_PRICE = 10_000;
const TAM_CLINICS = 10_000;
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("ru-RU");

export function mountMonetization(root) {
  if (!root) return;
  const find = (selector) => root.querySelector(selector);
  const range = find("#monetization-clinics");
  const bars = [...root.querySelectorAll(".monetization-bar")];
  const mosaic = find("[data-revenue-mosaic]");
  const panels = [...root.querySelectorAll(".monetization-panel")];
  const replay = find("[data-monetization-replay]");
  const somBar = find("[data-som-bar]");

  function createCells(element, count) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const cell = document.createElement("i");
      cell.style.setProperty("--cell-delay", `${80 + i * 32}ms`);
      fragment.append(cell);
    }
    element.replaceChildren(fragment);
  }

  function fill(element, filled) {
    [...element.children].forEach((cell, index) => {
      const fraction = Math.max(0, Math.min(1, filled - index));
      cell.classList.toggle("is-filled", fraction > 0);
      cell.style.setProperty("--cell-fill", `${fraction * 100}%`);
    });
  }

  bars.forEach((bar) => {
    createCells(bar, 40);
    fill(bar, Number(bar.dataset.marketRatio) * 40);
  });
  createCells(mosaic, 100);

  function update() {
    const clinics = Number(range.value);
    const monthlyRevenue = clinics * MONTHLY_PRICE;
    const annualMillions = number.format((monthlyRevenue * 12) / 1_000_000);
    find("[data-annual-revenue]").textContent = annualMillions;
    find("[data-monthly-revenue]").textContent = money.format(monthlyRevenue);
    for (const selector of [
      "[data-scenario-clinics]",
      "[data-formula-clinics]",
      "[data-som-clinics]",
      "[data-clinics-output]",
    ]) {
      find(selector).textContent = money.format(clinics);
    }
    find("[data-som-revenue]").textContent = `${annualMillions} млн ₽`;
    fill(somBar, (clinics / TAM_CLINICS) * 40);
    fill(mosaic, clinics);
  }

  range.disabled = false;
  replay.hidden = false;
  update();
  range.addEventListener("input", () => {
    panels.forEach((panel) => panel.setAttribute("data-interacting", ""));
    update();
  });
  replay.addEventListener("click", () => {
    panels.forEach((panel) => {
      panel.removeAttribute("data-interacting");
      panel.classList.remove("is-visible");
    });
    // Restart only this section's one-shot cell animation.
    void root.offsetWidth;
    panels.forEach((panel) => panel.classList.add("is-visible"));
  });
}
