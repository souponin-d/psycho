import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import styles from "./AppShell.module.css";

export type Section = {
  path: string;
  title: string;
  description: string;
  content: ReactNode;
};
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const snapshot = () => window.location.hash.slice(1);

export function AppShell({
  title,
  defaultPath,
  sections,
}: {
  title: string;
  defaultPath: string;
  sections: readonly Section[];
}) {
  const hash = useSyncExternalStore(subscribe, snapshot, () => "");
  const path = hash || defaultPath;
  const section = sections.find((item) => item.path === path);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPath = useRef(path);
  const pageTitle = section?.title ?? "Страница не найдена";
  useEffect(() => {
    document.title = `${pageTitle} · ${title} · Синкли`;
    if (previousPath.current !== path) heading.current?.focus();
    previousPath.current = path;
  }, [path, pageTitle, title]);
  return (
    <div className={styles.shell}>
      <a
        className={styles.skip}
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        К содержимому
      </a>
      <aside className={styles.sidebar}>
        <div>
          <a
            className={styles.brand}
            href={`#${defaultPath}`}
            aria-label="Синкли — основной раздел"
          >
            <span className={styles.mark} aria-hidden="true">
              с
            </span>
            Синкли
          </a>
          <p className={styles.appName}>{title}</p>
        </div>
        <nav aria-label="Разделы приложения" className={styles.nav}>
          {sections.map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              aria-current={path === item.path ? "page" : undefined}
            >
              {item.title}
            </a>
          ))}
        </nav>
        <p className={styles.sidebarNote}>
          P01a · Подготовка веб-приложений
          <br />
          Только вымышленные примеры
        </p>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <span>{title}</span>
          <span className={styles.development}>
            Среда разработки · синтетические данные
          </span>
        </header>
        <main id="main-content" className={styles.content}>
          <div className={styles.heading}>
            <h1 ref={heading} tabIndex={-1}>
              {pageTitle}
            </h1>
            <p className="muted">
              {section?.description ??
                "Такого раздела нет. Вернитесь в рабочую область приложения."}
            </p>
          </div>
          {section ? (
            <div key={path}>{section.content}</div>
          ) : (
            <div className="panel">
              <a href={`#${defaultPath}`}>Открыть основной раздел</a>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
