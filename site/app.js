import { mountMonetization } from "./monetization.js";
const screenSources = {
  doctor: new URL("./assets/product/doctor.jpg", import.meta.url).href,
  observation: new URL("./assets/product/observation.jpg", import.meta.url)
    .href,
  plan: new URL("./assets/product/plan.jpg", import.meta.url).href,
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const menu = $(".menu-toggle"),
  nav = $("#site-nav");
function closeMenu() {
  nav.classList.remove("is-open");
  menu.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-label", "Открыть меню");
}
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  nav.classList.toggle("is-open", open);
});
$$("a", nav).forEach((a) => a.addEventListener("click", closeMenu));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".site-header") &&
    menu.getAttribute("aria-expanded") === "true"
  )
    closeMenu();
});
const pictureNames = {
  doctor: "Кабинет врача",
  patient: "Приложение пациента",
  clinic: "Кабинет клиники",
  observation: "Наблюдение",
  plan: "Лечение и план",
};
$$("[data-detail]").forEach((b) =>
  b.addEventListener("click", () => {
    const scene = b.closest(".scene");
    $(".role-screen img", scene).src = screenSources[b.dataset.detail];
    $(".role-screen img", scene).alt = pictureNames[b.dataset.detail];
    $$("[data-detail]", scene).forEach((x) =>
      x.setAttribute("aria-pressed", String(x === b)),
    );
  }),
);
$$(".audience-survey-mosaic").forEach((m) =>
  $$(".is-filled", m).forEach((c, i) => c.style.setProperty("--i", i)),
);
if ("IntersectionObserver" in window) {
  const obs = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view", "playing");
          obs.unobserve(e.target);
        }
      }),
    { threshold: 0.09 },
  );
  $$(".reveal,.audience-survey-mosaic").forEach((e) => obs.observe(e));
}
const story = $(".story"),
  steps = $$("[data-step]"),
  scenes = $$("[data-scene]");
let phase = 0,
  scheduled = false;
function update() {
  const full = document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.setProperty(
    "--read-progress",
    full > 0 ? (scrollY / full).toFixed(4) : 0,
  );
  const hero = $(".hero").getBoundingClientRect(),
    p = Math.min(1, Math.max(0, -hero.top / hero.height));
  $(".hero").style.setProperty("--hero-progress", reduced ? 0 : p.toFixed(3));
  $(".hero-art").dataset.pose = p > 0.3 ? "settled" : "open";
  if (story) {
    const r = story.getBoundingClientRect();
    const progress = Math.min(
      1,
      Math.max(0, (innerHeight * 0.4 - r.top) / (r.height - innerHeight * 0.3)),
    );
    $(".story-stage").style.setProperty(
      "--story-progress",
      progress.toFixed(3),
    );
    const pivot = innerHeight * (innerWidth <= 600 ? 0.8 : 0.5);
    let best = 0,
      dist = Infinity;
    steps.forEach((s, i) => {
      const b = s.getBoundingClientRect(),
        d = Math.abs(b.top + b.height * 0.5 - pivot);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    if (best !== phase) {
      phase = best;
      steps.forEach((s, i) => s.classList.toggle("active", i === phase));
      scenes.forEach((s, i) => {
        s.classList.toggle("active", i === phase);
        s.setAttribute("aria-hidden", String(i !== phase));
      });
    }
  }
  scheduled = false;
}
addEventListener(
  "scroll",
  () => {
    if (!scheduled) {
      requestAnimationFrame(update);
      scheduled = true;
    }
  },
  { passive: true },
);
addEventListener("resize", update);
update();
document.documentElement.dataset.ready = "true";

const tariffRoot = document.querySelector("[data-monetization]");
const tariffTabs = [...document.querySelectorAll("[data-tariff-tab]")];
const tariffPanels = [...document.querySelectorAll(".tariff-panel")];
const tariffTrack = document.querySelector(".tariff-track");
const tariffViewport = document.querySelector(".tariff-viewport");
let selectedTariff = 0,
  pricingSeen = false;
function fitTariff() {
  const panel = tariffPanels[selectedTariff];
  if (panel) tariffViewport.style.height = panel.offsetHeight + "px";
}
function playTariff() {
  if (!pricingSeen) return;
  const panel = tariffPanels[selectedTariff].querySelector(
    ".monetization-panel",
  );
  panel.classList.remove("is-visible");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => panel.classList.add("is-visible")),
  );
}
function selectTariff(index, focus = false) {
  selectedTariff = index;
  document.querySelector(".tariff-tabs").dataset.selected = String(index);
  tariffTabs.forEach((t, i) => {
    t.setAttribute("aria-selected", String(i === index));
    t.tabIndex = i === index ? 0 : -1;
    if (i === index && focus) t.focus();
  });
  tariffPanels.forEach((p, i) => {
    p.setAttribute("aria-hidden", String(i !== index));
    p.inert = i !== index;
  });
  tariffTrack.style.transform = "translateX(-" + index * 100 + "%)";
  fitTariff();
  playTariff();
}
tariffTabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTariff(i));
  tab.addEventListener("keydown", (e) => {
    let next;
    if (e.key === "ArrowRight") next = (i + 1) % 2;
    if (e.key === "ArrowLeft") next = (i + 1) % 2;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = 1;
    if (next !== undefined) {
      e.preventDefault();
      selectTariff(next, true);
    }
  });
});
new ResizeObserver(fitTariff).observe(tariffPanels[0]);
new ResizeObserver(fitTariff).observe(tariffPanels[1]);
addEventListener("resize", fitTariff);
document.fonts.ready.then(fitTariff);
fitTariff();
if ("IntersectionObserver" in window) {
  const po = new IntersectionObserver(
    (es) => {
      if (es.some((e) => e.isIntersecting)) {
        pricingSeen = true;
        playTariff();
        po.disconnect();
      }
    },
    { threshold: 0.1 },
  );
  po.observe(tariffRoot);
} else {
  pricingSeen = true;
  playTariff();
}

(() => {
  const header = document.querySelector(".site-header");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  function measure() {
    document.documentElement.style.setProperty(
      "--header-height",
      Math.ceil(header.getBoundingClientRect().height) + "px",
    );
  }
  new ResizeObserver(measure).observe(header);
  measure();
  function place(hash, behavior) {
    let target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    if (target.id === "patient-screen")
      target = document.getElementById("role-patient");
    const top =
      target.id === "page-start"
        ? 0
        : Math.max(
            0,
            target.getBoundingClientRect().top +
              scrollY -
              header.getBoundingClientRect().height,
          );
    scrollTo({ top, behavior });
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (
      !a ||
      e.defaultPrevented ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    )
      return;
    const hash = a.getAttribute("href");
    if (
      hash.length < 2 ||
      !document.getElementById(decodeURIComponent(hash.slice(1)))
    )
      return;
    e.preventDefault();
    if (location.hash !== hash) history.pushState(null, "", hash);
    place(hash, motion.matches ? "instant" : "smooth");
  });
  addEventListener("hashchange", () =>
    place(location.hash, motion.matches ? "instant" : "smooth"),
  );
  document.fonts.ready.then(() => {
    measure();
    if (location.hash)
      requestAnimationFrame(() => place(location.hash, "instant"));
  });
  addEventListener("load", () => {
    if (location.hash)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => place(location.hash, "instant")),
      );
  });
  const title = document.querySelector("#monetization-title"),
    investor = document.querySelector("#tab-investor");
  let generation = 0,
    animations = [];
  async function updateTitle() {
    const isInvestor = investor.getAttribute("aria-selected") === "true";
    document.querySelector(".tariffs-clinic-copy").hidden = isInvestor;
    const text = isInvestor ? "Монетизация" : "Тарифы";
    const own = ++generation;
    animations.forEach((a) => a.cancel());
    animations = [];
    if (title.textContent === text) return;
    if (motion.matches) {
      title.textContent = text;
      return;
    }
    const out = title.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-9px)" },
      ],
      { duration: 160, easing: "ease-in", fill: "forwards" },
    );
    animations.push(out);
    try {
      await out.finished;
    } catch {
      return;
    }
    if (own !== generation) return;
    title.textContent = text;
    out.cancel();
    const enter = title.animate(
      [
        { opacity: 0, transform: "translateY(9px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    animations = [enter];
  }
  new MutationObserver(updateTitle).observe(investor, {
    attributes: true,
    attributeFilter: ["aria-selected"],
  });
  updateTitle();
})();

mountMonetization(document.querySelector("[data-monetization]"));
document.documentElement.classList.add("js-ready");
