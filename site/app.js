const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Presentation state only. No patient data, network calls, cookies or storage.
const state = {
  role: "doctor",
  case: "followup",
  stage: 0,
  mood: "neutral",
  mainApproved: false,
};
let toastTimer;
let dialogTrigger;

function toast(message) {
  const element = $("#toast");
  const host = $("dialog[open]") || document.body;
  host.append(element);
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 4000);
}

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

const clinicalTemplates = {
  dynamics: () =>
    `<h4>Состояние в динамике</h4><p>Результаты самоотчётов доступны лечащему врачу.</p><div class="score-cards"><div><strong>07</strong><span>PHQ-9<small>Предыдущее значение: 11</small></span></div><div><strong>06</strong><span>GAD-7<small>Предыдущее значение: 10</small></span></div></div><svg class="clinical-spark" viewBox="0 0 440 85" aria-label="Вымышленная динамика баллов шкал"><path d="M0 20H440M0 50H440M0 80H440" stroke="#e9eee0" stroke-width="1" stroke-dasharray="3 5"/><path d="M8 15C60 10 70 33 120 29S185 43 225 42 285 56 330 54 380 68 430 65"/><path d="M8 30C60 26 70 42 120 40S185 52 225 50 285 66 330 64 380 78 430 75" stroke="#baabc9" stroke-width="1.5"/></svg>`,
  safety: () =>
    `<h4>Приоритеты видны сразу</h4><p>Учебные сигналы. Тяжесть и маршрут оценивает врач.</p><div class="safety-row">${icon("bell")}<div><b>Обязательно · оценить новый сигнал</b><p>Сообщение о выраженном ухудшении. Сигнал адресован лечащему врачу.</p></div></div><div class="safety-row recommended">${icon("person")}<div><b>Желательно · обсудить консультацию</b><p>Вопрос о направлении к психиатру включён в повестку приёма.</p></div></div><div class="review-stamp">${icon("shield")} Маршрутизация меняется после подтверждения врачом</div>`,
  plan: () =>
    `<h4>Клиническое решение остаётся вашим</h4><p>План учитывает симптомы, переносимость и контекст.</p><div class="plan-summary"><small>РАССМОТРЕНИЕ ТЕРАПИИ В РАМКАХ КЕЙСА</small><b>Авиандр · решение лечащего врача</b><p>Перед назначением — сверка показаний, противопоказаний и режима по действующей инструкции ГРЛС.</p></div><button class="mini-action" data-approve-main ${state.mainApproved ? "disabled" : ""}>${state.mainApproved ? "Учебное рассмотрение подтверждено ✓" : "Подтвердить учебное рассмотрение"}</button><div class="review-stamp">${icon("file")} Назначения и дозировки на лендинге не формируются</div>`,
};

function renderClinical(name) {
  const panel = $("#clinical-content");
  panel.setAttribute("aria-labelledby", `tab-${name}`);
  panel.innerHTML = clinicalTemplates[name]();
  $("[data-approve-main]", panel)?.addEventListener("click", () => {
    state.mainApproved = true;
    renderClinical("plan");
    panel.focus({ preventScroll: true });
    toast("Учебное рассмотрение отмечено. Реальные назначения не создаются.");
  });
}
setupTabs("[data-clinical-tab]", (tab) =>
  renderClinical(tab.dataset.clinicalTab),
);
renderClinical("dynamics");

function workspaceMarkup(native = false) {
  return `<div class="device-mini ${native ? "native-device" : ""}"><div class="window-bar"><div class="window-dots"><i></i><i></i><i></i></div><span>${native ? "Синкли · рабочее место врача" : "Клиническое пространство · веб"}</span><span>Демо</span></div><div class="mini-workspace"><aside class="mini-sidebar"><b>синкли</b><span>Обзор пациентов</span><span>Клинические карточки</span><span>Очередь внимания</span><span>База знаний</span></aside><div class="mini-workspace-content"><small>ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</small><h4>${native ? "Приём начинается с контекста" : "Держите важное в поле зрения"}</h4><div class="mini-data-row"><div><small>ПАЦИЕНТЫ</small><b>24</b></div><div><small>САМООТЧЁТЫ</small><b>08</b></div><div><small>ВНИМАНИЕ</small><b>02</b></div></div><div class="mini-patient-lines"><div><span class="avatar avatar-lilac">АМ</span> Анна М. · новые данные <span class="mini-pill mint">Обновлено</span></div><div><span class="avatar avatar-sand">СК</span> Сергей К. · следующий приём <span class="mini-pill lilac">16 октября</span></div><div><span class="avatar avatar-blue">ОВ</span> Ольга В. · новый сигнал <span class="mini-pill amber">Проверить</span></div></div></div></div></div>`;
}
const platforms = {
  web: {
    kicker: "ДЛЯ ВРАЧА И КЛИНИКИ",
    title: "Рабочий день.<br />Собранный воедино.",
    copy: "Карточки пациентов, динамика и очередь внимания. Единая среда в браузере — от индивидуальной практики до команды клиники.",
    tags: ["Карточка пациента", "Общий контекст", "Разделение доступа"],
    markup: () => workspaceMarkup(),
  },
  desktop: {
    kicker: "ДЛЯ КЛИНИЧЕСКОГО РАБОЧЕГО МЕСТА",
    title: "Сосредоточиться<br />на самом приёме.",
    copy: "Отдельное рабочее приложение для врача: сводка к визиту, история решений и клинические источники в одном окне. Тот же защищённый контур данных.",
    tags: ["Рабочее пространство", "Сводка к приёму", "История решений"],
    markup: () => workspaceMarkup(true),
  },
  mobile: {
    kicker: "ДЛЯ ПОВСЕДНЕВНОЙ ЖИЗНИ ПАЦИЕНТА",
    title: "Небольшие отметки.<br />Важная связь.",
    copy: "Самоотчёты, личная динамика, задачи врача и диалог. Пациент понимает план, а его наблюдения становятся частью клинической картины.",
    tags: ["Личная динамика", "План сопровождения", "Прямой диалог"],
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
  $("#ecosystem-visual").innerHTML = data.markup();
  $("#platform-panel").setAttribute("aria-labelledby", `platform-${name}`);
}
setupTabs("[data-platform]", (tab) => renderPlatform(tab.dataset.platform));
renderPlatform("web");

const cases = {
  first: {
    label: "Первичный приём",
    title: "Собрать полную картину",
    text: "Анна М., 34 года. Жалобы на тревогу и нарушения сна. Врач уточняет анамнез, текущую терапию, риски и необходимость консультации психиатра.",
    route: "Желательно · обсудить консультацию психиатра",
  },
  followup: {
    label: "Между визитами",
    title: "Заметить изменения",
    text: "Анна М., 34 года. Идёт наблюдение. Пациент отмечает самочувствие и переносимость; сведения поступают её лечащему врачу.",
    route: "Желательно · уточнить маршрут на повторном приёме",
  },
  review: {
    label: "Повторная оценка",
    title: "Принять следующее решение",
    text: "Анна М., 34 года. Новый самоотчёт требует оценки врача. Врач сопоставляет динамику, риски и план лечения, затем подтверждает дальнейший маршрут.",
    route: "Обязательно · оценить необходимость направления",
  },
};

function contextMarkup() {
  const data = cases[state.case];
  return `<section class="demo-context"><span class="mini-pill lilac">Связь: пациент АМ-034 → врач ЕК-01</span><h3>${data.title}</h3><p>${data.text}</p><label class="demo-case-label" for="case-select">Учебный клинический сценарий</label><select id="case-select">${Object.entries(
    cases,
  )
    .map(
      ([key, value]) =>
        `<option value="${key}" ${key === state.case ? "selected" : ""}>${value.label}</option>`,
    )
    .join(
      "",
    )}</select><small>Для всех сценариев: рассмотрение «Авиандра» врачом по действующей инструкции. Решение о назначении принимается после оценки пациента; дозировки не моделируются.</small></section>`;
}

function doctorMarkup() {
  const stage = state.stage;
  const action = stage < 2 ? "simulate-alert" : "approve-demo";
  const label =
    stage < 2
      ? "Показать получение сигнала"
      : stage === 2
        ? "Подтвердить учебное решение врача"
        : "Учебное решение подтверждено ✓";
  return `<div class="demo-grid">${contextMarkup()}<section class="demo-activity"><h4>Карточка пациента АМ-034</h4><p>${stage >= 1 ? "Самоотчёт пациента получен и связан с его карточкой." : "Данные связаны с ведущим врачом. Переключитесь в роль пациента и отправьте учебный самоотчёт."}</p><div class="demo-steps"><span class="done">Данные</span><span class="${stage >= 2 ? "done" : ""}">Сигнал</span><span class="${stage >= 3 ? "done" : ""}">Решение врача</span></div>${stage >= 2 ? `<div class="demo-alert"><strong>Обязательно · оценить новый сигнал</strong><span>Выраженное ухудшение самочувствия в учебном сообщении. Сигнал доставлен ведущему врачу; дальнейшие действия определяет врач.</span></div>` : `<div class="plan-summary"><small>ДИНАМИКА И КОНТЕКСТ</small><b>PHQ-9: 11 → 7 · GAD-7: 10 → 6</b><p>Вымышленные значения. Интерпретация с учётом клинической картины.</p></div>`}<div class="review-stamp">${icon("person")} ${cases[state.case].route}</div><button class="button ${stage >= 3 ? "button-mint" : "button-dark"}" data-action="${action}" ${stage >= 3 ? "disabled" : ""}>${label}</button><p class="demo-treatment">Терапия: рассмотреть варианты, включая Авиандр, после сверки с <a href="https://grls.rosminzdrav.ru/" target="_blank" rel="noopener noreferrer"><u>ГРЛС ↗</u></a>. Подтверждение в демо не создаёт назначения.</p></section></div>`;
}

function patientMarkup() {
  const submitted = state.stage >= 1;
  return `<div class="demo-grid"><section class="demo-context"><span class="mini-pill mint">Роль: пациент АМ-034</span><h3>Ваш день —<br />часть общей картины.</h3><p>Отметьте учебное самочувствие. Запись увидит только ваш лечащий врач в этом демонстрационном сценарии.</p><small>Здесь нет свободного ввода медицинских сведений. Действия изменяют только демонстрационный экран.</small></section><section class="demo-activity"><h4>Как вы сегодня?</h4><div class="patient-options"><button aria-pressed="${state.mood === "better"}" data-mood="better">Лучше</button><button aria-pressed="${state.mood === "neutral"}" data-mood="neutral">Без изменений</button><button aria-pressed="${state.mood === "worse"}" data-mood="worse">Хуже</button></div><p>Лечащий врач: Елена К. · ЕК-01</p><div class="plan-summary"><small>ПЛАН СОПРОВОЖДЕНИЯ</small><b>Наблюдение и контакт с врачом</b><p>Отмечать самочувствие, переносимость и выполнение согласованных рекомендаций. Вопросы о терапии адресовать врачу.</p></div><button class="button ${submitted ? "button-mint" : "button-dark"}" data-action="send-report" ${submitted ? "disabled" : ""}>${submitted ? "В карточке у врача ✓" : "Поделиться учебным самоотчётом"}</button>${state.stage >= 2 ? `<div class="demo-alert"><strong>Врач получил учебный сигнал</strong><span>Демо не является каналом медицинской помощи.</span></div>` : ""}</section></div>`;
}

function clinicMarkup() {
  return `<div class="demo-grid"><section class="demo-context"><span class="mini-pill mint">Роль: клиника</span><h3>Контроль процесса.<br />С сохранением границ.</h3><p>Работа команды, очередь внимания и история действий. Просмотр клинических сведений ограничивается полномочиями и правовыми основаниями.</p><small>Целевой контур: российские серверы, разграничение ролей, аудит действий и проверяемые процедуры восстановления.</small></section><section class="demo-activity"><h4>Наблюдение команды</h4><div class="demo-mini-stats"><div><b>${state.stage >= 1 ? "01" : "00"}</b><span>Самоотчётов в демо</span></div><div><b>${state.stage === 2 ? "01" : "00"}</b><span>Необработанных сигналов</span></div><div><b>${state.stage >= 3 ? "01" : "00"}</b><span>Решений врача</span></div></div><ol class="demo-timeline"><li><b>Пациент АМ-034</b> связан с врачом ЕК-01</li>${state.stage >= 1 ? "<li>Самоотчёт добавлен в карточку пациента</li>" : "<li>Ожидается учебный самоотчёт</li>"}${state.stage >= 2 ? "<li>Сигнал адресован ведущему врачу</li>" : ""}${state.stage >= 3 ? "<li><b>Врач подтвердил учебное рассмотрение</b></li>" : ""}</ol><span class="mini-pill lilac">Действия учитываются в общем контексте</span><p>В будущем продукте клиника задаёт регламент эскалации и заместителей. История доступа и клинических изменений сохраняется в аудите.</p></section></div>`;
}

function renderDemo() {
  const panel = $("#demo-content");
  panel.setAttribute("aria-labelledby", `role-${state.role}`);
  panel.innerHTML =
    state.role === "patient"
      ? patientMarkup()
      : state.role === "clinic"
        ? clinicMarkup()
        : doctorMarkup();
  $("#case-select", panel)?.addEventListener("change", (event) => {
    state.case = event.target.value;
    state.stage = 0;
    state.mood = "neutral";
    renderDemo();
    $("#case-select", panel).focus();
  });
  $$("[data-mood]", panel).forEach((button) =>
    button.addEventListener("click", () => {
      state.mood = button.dataset.mood;
      renderDemo();
      $(`[data-mood="${state.mood}"]`, panel).focus();
    }),
  );
  $$("[data-action]", panel).forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.action === "send-report") {
        state.stage = state.mood === "worse" ? 2 : 1;
        toast(
          state.stage === 2
            ? "Учебный самоотчёт и сигнал доступны врачу."
            : "Учебный самоотчёт добавлен в карточку у врача.",
        );
      } else if (button.dataset.action === "simulate-alert") {
        state.stage = 2;
        toast("Учебный сигнал адресован врачу ЕК-01.");
      } else if (button.dataset.action === "approve-demo") {
        state.stage = 3;
        toast(
          "Рассмотрение отмечено врачом. Проверьте историю в роли клиники.",
        );
      }
      renderDemo();
      panel.focus({ preventScroll: true });
    }),
  );
}

setupTabs("[data-role]", (tab) => {
  state.role = tab.dataset.role;
  renderDemo();
});
renderDemo();

function openDialog(dialog) {
  dialogTrigger = document.activeElement;
  dialog.showModal();
  document.body.classList.add("modal-open");
}
$$("[data-demo]").forEach((button) =>
  button.addEventListener("click", () => openDialog($("#product-dialog"))),
);
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
$("#reset-demo").addEventListener("click", () => {
  state.stage = 0;
  state.mood = "neutral";
  renderDemo();
  toast("Учебный сценарий начат заново.");
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
