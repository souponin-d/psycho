import { mountHeroAnimation } from "./hero-animation.js";

mountHeroAnimation(document.querySelector("[data-hero-animation]"));

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

$$(".audience-survey-mosaic").forEach((mosaic) => {
  $$(".is-filled", mosaic).forEach((cell, index) => {
    cell.style.setProperty("--cell-delay", `${80 + index * 28}ms`);
  });
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.06 },
  );
  document.documentElement.classList.add("js-ready");
  $$(".reveal").forEach((element) => observer.observe(element));
}

function setupTabs(selector, onSelect) {
  const tabs = $$(selector);
  const select = (tab) => {
    tabs.forEach((element) => {
      const selected = element === tab;
      element.setAttribute("aria-selected", String(selected));
      element.tabIndex = selected ? 0 : -1;
    });
    onSelect(tab);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        tabs[next].focus();
        select(tabs[next]);
      }
    });
  });
  return select;
}

const platforms = {
  doctor: {
    title: "Меньше времени на поиск информации.<br />Больше — на пациента.",
    copy: "История наблюдений, результаты опросников и динамика состояния в одном рабочем пространстве. Быстро готовьтесь к приёмам, замечайте изменения между визитами и определяйте, кому из пациентов требуется ваше внимание.",
    tags: ["Карточки пациентов", "Динамика состояния", "Мониторинг рисков"],
    href: "doctor/",
    link: "Перейти в кабинет врача",
    image: new URL("./assets/product/ecosystem-doctor.png", import.meta.url)
      .href,
    imageAlt:
      "Кабинет врача Синкли: карта пациента и динамика состояния – учебные данные",
  },
  clinic: {
    title: "Эффективное управление клиникой на основе данных",
    copy: "Получайте полную картину работы клиники, выявляйте проблемы и принимайте обоснованные решения на основе данных.",
    tags: [
      "Нагрузка врачей",
      "Статистика отделения",
      "Сопровождение пациентов",
    ],
    href: "demo/admin/",
    link: "Посмотреть кабинет руководителя",
    image: new URL("./assets/product/ecosystem-clinic.jpg", import.meta.url)
      .href,
    imageAlt:
      "Кабинет клиники Синкли: обзор и аналитика в композиции Разворот – учебные данные",
  },
  patient: {
    title:
      "Лучше понимать своё состояние. Легче следовать рекомендациям врача.",
    copy: "Отмечайте самочувствие и симптомы, отслеживайте изменения и держите рекомендации врача под рукой. Всё важное — в одном приложении, чтобы вам было проще следить за своим состоянием и оставаться на связи с врачом между приёмами. Ваши личные данные остаются конфиденциальными и недоступными для посторонних.",
    tags: ["Дневник самочувствия", "План лечения", "Конфиденциальность данных"],
    href: null,
    unavailableLink: "Посмотреть приложение пациента",
    image: new URL("./assets/product/ecosystem-patient.jpg", import.meta.url)
      .href,
    imageAlt:
      "Приложение пациента Синкли: Тихий берег, карта ощущений и план в композиции Каскад – учебные данные",
  },
};
function renderPlatform(name) {
  const data = platforms[name];
  $("#platform-title").innerHTML = data.title;
  $("#platform-copy").textContent = data.copy;
  $("#platform-tags").innerHTML = data.tags
    .map((tag) => `<span>${tag}</span>`)
    .join("");
  const link = $("#platform-link");
  const unavailable = $("#platform-unavailable");
  link.hidden = !data.href;
  unavailable.hidden = Boolean(data.href);
  if (data.href) {
    link.setAttribute("href", data.href);
    link.innerHTML = data.link + " " + icon("arrow");
  } else {
    link.removeAttribute("href");
    unavailable.innerHTML = data.unavailableLink + " " + icon("arrow");
  }
  const image = document.createElement("img");
  image.className = "ecosystem-mockup";
  image.src = data.image;
  image.alt = data.imageAlt;
  image.width = 1600;
  image.height = 1100;
  image.loading = "lazy";
  image.decoding = "async";
  $("#ecosystem-visual").replaceChildren(image);
  $("#platform-panel").setAttribute("aria-labelledby", `platform-${name}`);
  const selectedIndex = $$("[data-platform]").findIndex(
    (tab) => tab.dataset.platform === name,
  );
  $(".ecosystem-tabs").style.setProperty("--tab-index", selectedIndex);
  if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    $$(".platform-description, .ecosystem-visual").forEach((element) => {
      element.getAnimations?.().forEach((animation) => animation.cancel());
      element.animate?.(
        [
          { opacity: 0.25, transform: "translateY(7px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
  }
}
setupTabs("[data-platform]", (tab) => renderPlatform(tab.dataset.platform));
renderPlatform("doctor");

const menuButton = $(".menu-toggle");
const navigation = $("#navigation");
function closeMenu() {
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Открыть меню");
  navigation.classList.remove("is-open");
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  navigation.classList.toggle("is-open", open);
});
$$("a", navigation).forEach((link) =>
  link.addEventListener("click", closeMenu),
);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuButton.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    menuButton.focus();
  }
});

// Match native anchor offset to the actual sticky header, including breakpoints.
const header = $(".header");
function syncHeaderHeight() {
  document.documentElement.style.setProperty(
    "--header-height",
    header.getBoundingClientRect().height + "px",
  );
}
syncHeaderHeight();
if ("ResizeObserver" in window)
  new ResizeObserver(syncHeaderHeight).observe(header);
window.addEventListener("resize", syncHeaderHeight);
