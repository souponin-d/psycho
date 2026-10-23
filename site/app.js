import { mountHeroAnimation } from "./hero-animation.js";

mountHeroAnimation(document.querySelector("[data-hero-animation]"));

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

let dialogTrigger;

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

function workspaceMarkup(native = false) {
  return `<div class="device-mini ${native ? "native-device" : ""}"><div class="window-bar"><div class="window-dots"><i></i><i></i><i></i></div><span>${native ? "Синкли · рабочее место врача" : "Клиническое пространство · веб"}</span><span>Демо</span></div><div class="mini-workspace"><aside class="mini-sidebar"><b>синкли</b><span>Обзор пациентов</span><span>Клинические карточки</span><span>Очередь внимания</span><span>База знаний</span></aside><div class="mini-workspace-content"><small>ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</small><h4>${native ? "Приём начинается с контекста" : "Держите важное в поле зрения"}</h4><div class="mini-data-row"><div><small>ПАЦИЕНТЫ</small><b>24</b></div><div><small>САМООТЧЁТЫ</small><b>08</b></div><div><small>ВНИМАНИЕ</small><b>02</b></div></div><div class="mini-patient-lines"><div><span class="avatar avatar-lilac">АМ</span> Анна М. · новые данные <span class="mini-pill mint">Обновлено</span></div><div><span class="avatar avatar-sand">СК</span> Сергей К. · следующий приём <span class="mini-pill lilac">16 октября</span></div><div><span class="avatar avatar-blue">ОВ</span> Ольга В. · новый сигнал <span class="mini-pill amber">Проверить</span></div></div></div></div></div>`;
}
function clinicPreviewMarkup() {
  return `<div class="clinic-preview"><div class="clinic-preview-top"><span>Синкли / аналитика клиники</span><span>Демо-данные</span></div><h4>Сводка отделения</h4><p>Отделение · последние 14 дней</p><div class="clinic-metrics"><div><b>80</b><span>На сопровождении</span></div><div><b>12</b><span>Специалистов</span></div><div><b>24</b><span>Новых самоотчёта</span></div></div><div class="clinic-chart" role="img" aria-label="Вымышленная динамика активности за 14 дней"><i style="--bar:35%"></i><i style="--bar:48%"></i><i style="--bar:42%"></i><i style="--bar:63%"></i><i style="--bar:56%"></i><i style="--bar:72%"></i><i style="--bar:66%"></i><i style="--bar:84%"></i><i style="--bar:74%"></i><i style="--bar:90%"></i><i style="--bar:82%"></i><i style="--bar:100%"></i><i style="--bar:88%"></i><i style="--bar:95%"></i></div></div>`;
}

const platforms = {
  doctor: {
    kicker: "ДЛЯ ВРАЧА",
    title: "Рабочий день.<br />Собранный воедино.",
    copy: "Карточки пациентов, динамика и очередь внимания. Единая среда в браузере — от индивидуальной практики до команды клиники.",
    tags: ["Карточка пациента", "Общий контекст", "Разделение доступа"],
    href: "demo/doctor/",
    link: "Открыть демо врача",
    markup: () => workspaceMarkup(),
  },
  clinic: {
    kicker: "ДЛЯ РУКОВОДИТЕЛЯ И КОМАНДЫ КЛИНИКИ",
    title: "Команда клиники.<br /> В общей картине.",
    copy: "Показатели отделения, нагрузка команды и события сопровождения — в одной сводке. Доступ к данным определяется полномочиями.",
    tags: ["Показатели отделения", "Работа команды", "События сопровождения"],
    href: "demo/admin/",
    link: "Открыть демо администратора",
    markup: () => clinicPreviewMarkup(),
  },
  patient: {
    kicker: "ДЛЯ ПОВСЕДНЕВНОЙ ЖИЗНИ ПАЦИЕНТА",
    title: "Небольшие отметки.<br />Важная связь.",
    copy: "Самоотчёты, личная динамика, задачи врача и диалог. Пациент понимает план, а его наблюдения становятся частью клинической картины.",
    tags: ["Личная динамика", "План сопровождения", "Прямой диалог"],
    href: null,
    link: "",
    markup: () =>
      `<div class="mobile-device-group"><div class="phone"><div class="phone-island"></div><div class="phone-status"><b>9:41</b><span>••• ▰</span></div><div class="phone-app"><div class="phone-app-brand">синкли</div><h3>Небольшой шаг.<br />Каждый день.</h3><p>Состояние, сон и самочувствие.<br />В контексте вашего лечения.</p><div class="phone-checkin"><span>Ваш план на сегодня</span><b>Отметить самочувствие ✓</b><div class="sleep-bars"><i></i><i></i><i></i><i></i><i></i></div></div><div class="phone-button">Написать врачу ↗</div><div class="phone-tabbar"><span>⌂<small>Сегодня</small></span><span>⌁<small>Динамика</small></span><span>□<small>Диалог</small></span></div></div></div><div class="mobile-summary"><span class="mini-pill mint">Связано с лечащим врачом</span><h4>Ваши наблюдения<br />имеют значение.</h4><p>Самоотчёт попадает в вашу карточку. Вы видите собственную динамику и задачи.</p><div class="review-stamp">${icon("shield")} Доступ только к своим данным</div></div></div>`,
  },
};
function renderPlatform(name) {
  const data = platforms[name];
  $("#platform-kicker").textContent = data.kicker;
  $("#platform-title").innerHTML = data.title;
  $("#platform-copy").textContent = data.copy;
  $("#platform-tags").innerHTML = data.tags
    .map((tag) => `<span>${tag}</span>`)
    .join("");
  const link = $("#platform-link");
  link.hidden = !data.href;
  $("#platform-unavailable").hidden = Boolean(data.href);
  if (data.href) {
    link.setAttribute("href", data.href);
    link.innerHTML = data.link + " " + icon("arrow");
  } else {
    link.removeAttribute("href");
  }
  $("#ecosystem-visual").innerHTML = data.markup();
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

function openDialog(dialog) {
  dialogTrigger = document.activeElement;
  dialog.showModal();
  document.body.classList.add("modal-open");
}
$$("[data-privacy]").forEach((button) =>
  button.addEventListener("click", () => openDialog($("#privacy-dialog"))),
);
$$("dialog").forEach((dialog) => {
  $("[data-close]", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    if (dialogTrigger?.isConnected)
      dialogTrigger.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    )
      dialog.close();
  });
});
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

const surveyData = [
  {
    percent: 80,
    count: 64,
    label: "Сталкиваются с разрозненностью информации о лечении.",
  },
  {
    percent: 70,
    count: 56,
    label: "Сложно восстановить изменения самочувствия между приёмами.",
  },
  {
    percent: 75,
    count: 60,
    label: "Хотели бы видеть план и динамику в одном месте.",
  },
];
const chartNames = { rings: "Кольца", bars: "Полосы", mosaic: "Мозаика" };
const chartTabs = $$("[data-survey-chart]");
let chartIndex = 0;
function renderSurveyChart(type) {
  chartIndex = Object.keys(chartNames).indexOf(type);
  const chart = $("#survey-chart");
  chart.setAttribute("aria-labelledby", "chart-" + type);
  chart.className = "survey-chart chart-" + type;
  chart.innerHTML = surveyData
    .map((data, index) => {
      const visual =
        type === "rings"
          ? `<div class="survey-ring" aria-hidden="true" style="--value:${data.percent}%"><span>${data.percent}<small>%</small></span></div>`
          : type === "mosaic"
            ? `<div class="survey-mosaic" aria-hidden="true">${Array.from({ length: 80 }, (_, i) => `<i class="${i < data.count ? "filled" : ""}" style="--delay:${(i % 8) * 25}ms"></i>`).join("")}</div>`
            : `<div class="survey-track" aria-hidden="true"><span style="--value:${data.percent}%"></span></div>`;
      return `<article class="survey-chart-item" style="--series:${index}"><div class="survey-stat"><strong>${data.percent}<span>%</span></strong><small>${data.count} из 80</small></div>${visual}<p>${data.label}</p></article>`;
    })
    .join("");
  $("#chart-position").textContent =
    chartIndex + 1 + " / 3 · " + chartNames[type];
}
setupTabs("[data-survey-chart]", (tab) =>
  renderSurveyChart(tab.dataset.surveyChart),
);
$("[data-chart-prev]").addEventListener("click", () =>
  chartTabs[(chartIndex + 2) % 3].click(),
);
$("[data-chart-next]").addEventListener("click", () =>
  chartTabs[(chartIndex + 1) % 3].click(),
);
renderSurveyChart("rings");
