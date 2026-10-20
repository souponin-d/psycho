import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Scenario } from "@psycho/ui-web/contracts";
import { roleLabels, type AdminDemoData, type AdminRole } from "./data";
import styles from "./workspace.module.css";

const sections: Record<
  AdminRole,
  { id: string; label: string; title: string; description: string }[]
> = {
  coordinator: [
    {
      id: "day",
      label: "Рабочий день",
      title: "Рабочий день отделения",
      description:
        "Организуйте работу команды и закройте вопросы, требующие внимания.",
    },
    {
      id: "team",
      label: "Команда",
      title: "Команда отделения",
      description: "Расписание и организационный контекст кабинетов.",
    },
    {
      id: "events",
      label: "События",
      title: "Организационные события",
      description: "Подготовленные события и действия в этой вкладке.",
    },
  ],
  director: [
    {
      id: "overview",
      label: "Обзор",
      title: "Обзор отделения",
      description: "Активность и распределение пациентов между кабинетами.",
    },
    {
      id: "offices",
      label: "Кабинеты",
      title: "Показатели кабинетов",
      description: "Готовые показатели за выбранный период.",
    },
    {
      id: "report",
      label: "Отчёт",
      title: "Отчёт для руководителя",
      description:
        "Предпросмотр агрегированной сводки без медицинских карточек.",
    },
  ],
  system: [
    {
      id: "employees",
      label: "Сотрудники",
      title: "Сотрудники и доступы",
      description: "Один сотрудник может совмещать несколько рабочих ролей.",
    },
    {
      id: "matrix",
      label: "Возможности ролей",
      title: "Возможности рабочих пространств",
      description: "Какие задачи и данные доступны в каждом пространстве демо.",
    },
    {
      id: "access",
      label: "Журнал доступа",
      title: "Журнал изменений доступа",
      description:
        "Автор, сотрудник и состав ролей до и после учебного изменения.",
    },
  ],
};
const defaultPath = (role: AdminRole) => `/${role}/${sections[role][0]!.id}`;
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const snapshot = () => window.location.hash.slice(1);

export function AdminWorkspace({
  data,
  scenario,
  onScenario,
  examples,
  children,
}: {
  data: AdminDemoData | null;
  scenario: Scenario;
  onScenario: (scenario: Scenario) => void;
  examples?: ReactNode;
  children: (role: AdminRole, section: string) => ReactNode;
}) {
  const current = data?.employees.find(
    (employee) => employee.id === data.currentEmployeeId,
  );
  const available = current?.roles ?? [];
  const first = available[0] ?? "coordinator";
  const hash = useSyncExternalStore(subscribe, snapshot, () => "");
  const rememberedRole = useRef<AdminRole>(first);
  const rememberedPaths = useRef<Record<AdminRole, string>>({
    coordinator: defaultPath("coordinator"),
    director: defaultPath("director"),
    system: defaultPath("system"),
  });
  const path = !hash || hash === "/summary" ? defaultPath(first) : hash;
  const candidate = (Object.keys(sections) as AdminRole[]).find((role) =>
    sections[role].some((section) => path === `/${role}/${section.id}`),
  );
  const allowed = candidate && available.includes(candidate);
  const role = allowed
    ? candidate
    : available.includes(rememberedRole.current)
      ? rememberedRole.current
      : first;
  const selected = allowed
    ? sections[role].find((section) => path === `/${role}/${section.id}`)
    : undefined;
  const isExamples = path === "/examples";
  const title = !data
    ? "Данные не загружены"
    : isExamples
      ? "Примеры компонентов"
      : (selected?.title ??
        (candidate ? "Пространство недоступно" : "Страница не найдена"));
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(hash);
  useEffect(() => {
    document.title = `${title} · Административный веб · Синкли`;
    if (previous.current !== hash) heading.current?.focus();
    previous.current = hash;
    if (allowed) {
      rememberedRole.current = role;
      rememberedPaths.current[role] = path;
    }
  }, [hash, title, allowed, role, path]);
  const siteHref = import.meta.env.VITE_DEMO_SITE_HOME;
  return (
    <div className={styles.shell}>
      <a
        className={styles.skip}
        href="#admin-main"
        onClick={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        К содержимому
      </a>
      <header className={styles.topbar}>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            А-01
          </span>
          <div>
            <strong>{current?.name ?? "Учебная учётная запись"}</strong>
            <span>Одна учётная запись · роли можно совмещать</span>
          </div>
        </div>
        <label className={styles.field}>
          Рабочее пространство
          <select
            value={role}
            disabled={!data}
            onChange={(event) => {
              const next = event.currentTarget.value as AdminRole;
              if (available.includes(next))
                window.location.hash = rememberedPaths.current[next];
            }}
          >
            {available.map((item) => (
              <option key={item} value={item}>
                {item === "coordinator"
                  ? "Координатор отделения"
                  : item === "director"
                    ? "Руководитель клиники"
                    : roleLabels[item]}
              </option>
            ))}
          </select>
        </label>
      </header>
      <aside className={styles.sidebar}>
        <a
          className={styles.brand}
          href={`#${defaultPath(role)}`}
          aria-label="Синкли — рабочее пространство"
        >
          <span className={styles.mark} aria-hidden="true" />
          синкли<span aria-hidden="true">·</span>
        </a>
        <p className={styles.small}>{roleLabels[role]}</p>
        <nav aria-label="Разделы рабочего пространства">
          {sections[role].map((section) => (
            <a
              key={section.id}
              href={`#/${role}/${section.id}`}
              aria-current={selected?.id === section.id ? "page" : undefined}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <p>{data?.unit ?? "Демо администратора"}</p>
          {siteHref && <a href={siteHref}>← На сайт Синкли</a>}
          <a href="#/examples">Примеры компонентов</a>
        </div>
      </aside>
      <main id="admin-main" className={styles.main}>
        <div className={styles.heading}>
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
            <p>
              {selected?.description ??
                (isExamples
                  ? "Служебный стенд разработки. Состояние демо сохраняется отдельно."
                  : "Откройте доступное рабочее пространство.")}
            </p>
          </div>
          <label className={styles.field}>
            Набор демо-данных
            <select
              value={scenario}
              onChange={(event) =>
                onScenario(event.currentTarget.value as Scenario)
              }
            >
              <option value="normal">Рабочий день</option>
              <option value="empty">Новое отделение</option>
              <option value="long">Длинные подписи</option>
            </select>
          </label>
        </div>
        {data && (
          <p className={styles.context}>
            {data.unit} · Снимок: {data.snapshot}
          </p>
        )}
        {!data ? (
          children(role, "day")
        ) : isExamples ? (
          examples
        ) : selected ? (
          children(role, selected.id)
        ) : (
          <section className={styles.panel}>
            <p>
              Раздел не существует или не входит в роли текущего сотрудника.
            </p>
            <a href={`#${defaultPath(role)}`}>Открыть рабочее пространство</a>
          </section>
        )}
        <footer className={styles.footer}>
          Демо · только вымышленные данные. Действия сохраняются в памяти
          вкладки до смены набора или перезагрузки. Назначение ролей здесь не
          меняет серверные права.
        </footer>
      </main>
    </div>
  );
}
