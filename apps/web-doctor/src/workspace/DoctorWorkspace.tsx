import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  demoRepository,
  login,
  serverRepository,
  serverSession,
  type Repository,
} from "./repository";
import { useWorkspace, message } from "./useWorkspace";
import { SourceLibrary, SourceProvider } from "./SourceLibrary";
import { NewPatient, PatientDirectory } from "./PatientDirectory";
import { Workday, Calendar } from "./Workday";
import { PatientView } from "./PatientView";
import { EncounterEditor, type RegisterGuard } from "./EncounterEditor";
import { Events } from "./Events";
import { formatDate, initials } from "./labels";
import { LoginSphere } from "./LoginSphere";
import {
  Button,
  Empty,
  ErrorNotice,
  Field,
  Icon,
  Modal,
  styles,
  type IconName,
} from "./ui/Elements";

export function DoctorWorkspace() {
  const [repository, setRepository] = useState<Repository | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mode = sessionStorage.getItem("doctor-workspace-mode");
        const repo =
          mode === "demo"
            ? await demoRepository()
            : mode === "server"
              ? serverRepository((await serverSession()).actor)
              : null;
        if (active) setRepository(repo);
      } catch (e) {
        if (active) setError(message(e));
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function logout() {
    if (!repository) return;
    try {
      await repository.logout();
      sessionStorage.removeItem("doctor-workspace-mode");
      setRepository(null);
      window.location.hash = "/workday";
    } catch (e) {
      setError(message(e));
    }
  }
  if (restoring)
    return (
      <div className={`${styles.root} ${styles.content}`} role="status">
        Открываем рабочее место…
      </div>
    );
  if (!repository)
    return (
      <LoginScreen
        error={error}
        onReady={(repo) => {
          sessionStorage.setItem("doctor-workspace-mode", repo.mode);
          setRepository(repo);
          setError("");
        }}
      />
    );
  return (
    <Workspace
      key={`${repository.mode}-${repository.actor.id}`}
      repository={repository}
      onLogout={logout}
      error={error}
    />
  );
}
function LoginScreen({
  onReady,
  error: initialError,
}: {
  onReady: (repository: Repository) => void;
  error: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function enter(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onReady(await login(email, password));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError("");
    try {
      onReady(await demoRepository());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`${styles.root} ${styles.login}`}>
      <div className={styles.loginIntro}>
        <LoginSphere />
        <div className={styles.loginCopy}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <Icon name="activity" size={23} />
            </span>
            синкли
          </div>
          <h1>
            Внимание пациенту.
            <br />
            Всё остальное —<br />
            под рукой.
          </h1>
          <p>
            Приёмы, история наблюдения и динамика состояния в одном рабочем
            пространстве врача.
          </p>
        </div>
      </div>
      <div className={styles.loginForm}>
        <h2>Рабочее место врача</h2>
        <p>
          Войдите в клинику или познакомьтесь со всеми сценариями на учебных
          данных.
        </p>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <form className={styles.form} onSubmit={enter}>
          <Field
            label="Рабочая электронная почта"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="doctor@clinic.ru"
            required
          />
          <Field
            label="Пароль"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            Войти в клинику
          </Button>
        </form>
        <div className={styles.loginDivider} />
        <Button
          variant="secondary"
          icon="arrow"
          onClick={() => void demo()}
          disabled={busy}
          style={{ width: "100%" }}
        >
          Открыть учебное рабочее место
        </Button>
      </div>
    </div>
  );
}
function Workspace({
  repository,
  onLogout,
  error: sessionError,
}: {
  repository: Repository;
  onLogout: () => Promise<void>;
  error: string;
}) {
  const actions = useWorkspace(repository);
  const [route, setRoute] = useState(
    window.location.hash.slice(1) || "/workday",
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const [mobile, setMobile] = useState(false);
  const [newPatient, setNewPatient] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthEmail, setReauthEmail] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthError, setReauthError] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const reauthPending = useRef(false);
  const headingRef = useRef<HTMLElement>(null);
  async function reauthenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reauthPending.current) return;
    reauthPending.current = true;
    setReauthBusy(true);
    setReauthError("");
    try {
      const renewed = await login(reauthEmail.trim(), reauthPassword);
      setReauthPassword("");
      if (
        renewed.actor.id !== repository.actor.id ||
        renewed.actor.clinicId !== repository.actor.clinicId
      ) {
        try {
          await renewed.logout();
          setReauthError(
            `Эта учётная запись не соответствует открытому рабочему месту врача ${repository.actor.name}. Войдите исходной учётной записью; черновик остаётся в редакторе.`,
          );
        } catch (error) {
          setReauthError(
            `Не удалось завершить сессию другой учётной записи. Сохранение остаётся приостановленным. Повторите вход исходной учётной записью. ${message(error)}`,
          );
        }
        return;
      }
      actions.setSessionExpired(false);
      actions.setError("");
      setReauthOpen(false);
      await actions.refresh();
    } catch (error) {
      setReauthError(message(error));
    } finally {
      reauthPending.current = false;
      setReauthBusy(false);
    }
  }
  const registerGuard: RegisterGuard = useCallback((value) => {
    guard.current = value;
  }, []);
  const navigate = useCallback((path: string) => {
    void (async () => {
      if (guard.current && !(await guard.current())) return;
      setMobile(false);
      window.location.hash = path;
    })();
  }, []);
  useEffect(() => {
    const listener = () => {
      void (async () => {
        if (guard.current && !(await guard.current())) {
          window.history.replaceState(null, "", `#${routeRef.current}`);
          return;
        }
        setRoute(window.location.hash.slice(1) || "/workday");
      })();
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [route]);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 760px)");
    const closeOnDesktop = () => {
      if (!narrow.matches) {
        setMobile(false);
        headingRef.current?.focus({ preventScroll: true });
      }
    };
    narrow.addEventListener("change", closeOnDesktop);
    return () => narrow.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    let expanded: HTMLDetailsElement[] = [];
    const beforePrint = () => {
      if (expanded.length) return;
      expanded = Array.from(
        document.querySelectorAll<HTMLDetailsElement>("details:not([open])"),
      );
      expanded.forEach((details) => {
        details.open = true;
      });
    };
    const afterPrint = () => {
      expanded.forEach((details) => {
        details.open = false;
      });
      expanded = [];
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      afterPrint();
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);
  const [, section = "workday", patientId, tab = "overview", visitId] =
    route.split("/");
  const patient = actions.patients.find((p) => p.id === patientId);
  const visit = patient?.visits.find((v) => v.id === visitId);
  const eventCount = actions.patients.reduce(
    (n, p) => n + p.events.filter((e) => e.status !== "closed").length,
    0,
  );
  const nav: { path: string; title: string; icon: IconName }[] = [
    { path: "workday", title: "Рабочий день", icon: "home" },
    { path: "patients", title: "Пациенты", icon: "people" },
    { path: "events", title: "Внимание", icon: "bell" },
    { path: "calendar", title: "Календарь", icon: "calendar" },
    { path: "sources", title: "Источники", icon: "book" },
  ];
  const title = nav.find((n) => n.path === section)?.title ?? "Рабочий день";
  const sessionRecovery = actions.sessionExpired && (
    <ErrorNotice>
      <strong>Сессия завершена</strong>
      <p>
        Черновик остаётся в открытом редакторе. Войдите снова как{" "}
        {repository.actor.name}, чтобы продолжить сохранение. Оставьте вкладку
        открытой до сохранения изменений.
      </p>
      <Button
        variant="secondary"
        style={{ marginTop: 10 }}
        onClick={() => setReauthOpen(true)}
      >
        Войти повторно
      </Button>
    </ErrorNotice>
  );
  const navigation = (
    <>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <Icon name="activity" size={23} />
        </span>
        синкли
      </div>
      <div className={styles.sidebarLabel}>Рабочее место врача</div>
      <nav className={styles.navigation} aria-label="Основная навигация">
        {nav.map((n) => (
          <button
            key={n.path}
            className={styles.navItem}
            aria-current={section === n.path ? "page" : undefined}
            onClick={() => navigate(`/${n.path}`)}
          >
            <Icon name={n.icon} size={19} />
            {n.title}
            {n.path === "events" && eventCount > 0 && (
              <span className={styles.navCount}>{eventCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div className={styles.sidebarBottom}>
        <div className={styles.identity}>
          <div className={styles.avatar}>{initials(repository.actor.name)}</div>
          <div>
            <strong>{repository.actor.name}</strong>
            <small>
              {repository.actor.specialty === "psychiatrist"
                ? "Врач-психиатр"
                : "Лечащий врач"}
            </small>
          </div>
        </div>
        <button
          className={styles.navItem}
          onClick={() => {
            void (async () => {
              if (guard.current && !(await guard.current())) return;
              await onLogout();
            })();
          }}
        >
          <Icon name="logout" size={17} />
          Выйти
        </button>
      </div>
    </>
  );
  return (
    <SourceProvider server={repository.mode === "server"}>
      <div className={`${styles.root} ${styles.workspace}`}>
        <a
          className={styles.skip}
          href="#workspace-content"
          onClick={(e) => {
            e.preventDefault();
            headingRef.current?.focus();
          }}
        >
          К содержимому
        </a>
        <aside className={styles.sidebar}>{navigation}</aside>
        <Modal
          open={mobile}
          onClose={() => setMobile(false)}
          title="Навигация"
          className={styles.mobileDrawer}
        >
          {sessionError && <ErrorNotice>{sessionError}</ErrorNotice>}
          {sessionRecovery}
          {navigation}
        </Modal>
        <main className={styles.main}>
          <header className={styles.topbar}>
            <div className={styles.breadcrumb}>
              <button
                className={styles.mobileMenu}
                aria-label="Открыть навигацию"
                aria-expanded={mobile}
                aria-haspopup="dialog"
                onClick={() => setMobile(true)}
              >
                <Icon name={mobile ? "close" : "menu"} />
              </button>
              <span>{title}</span>
              {patient && (
                <>
                  <Icon name="chevron" size={13} />
                  <span>{patient.profile.name}</span>
                </>
              )}
            </div>
            <div className={styles.topbarRight}>
              <span>
                {formatDate(new Date().toISOString(), {
                  day: "numeric",
                  month: "long",
                })}
              </span>
              {actions.savedAt && (
                <span className={styles.saved} role="status">
                  <Icon name="check" size={13} />
                  Сохранено{" "}
                  {formatDate(actions.savedAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <span className={styles.mode}>
                <Icon
                  name={repository.mode === "demo" ? "book" : "shield"}
                  size={12}
                />
                {repository.mode === "demo" ? "Учебные данные" : "Клиника"}
              </span>
            </div>
          </header>
          <section
            className={styles.content}
            ref={headingRef}
            tabIndex={-1}
            id="workspace-content"
            aria-label={title}
          >
            {sessionError && <ErrorNotice>{sessionError}</ErrorNotice>}
            {sessionRecovery}
            {actions.error && (
              <ErrorNotice>
                {actions.error}
                <div className={styles.row} style={{ marginTop: 8 }}>
                  {!actions.sessionExpired && (
                    <Button
                      variant="secondary"
                      icon="refresh"
                      onClick={() => void actions.refresh()}
                    >
                      Обновить данные
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => actions.setError("")}>
                    Скрыть сообщение
                  </Button>
                </div>
              </ErrorNotice>
            )}
            {actions.loading ? (
              <div role="status" aria-label="Загрузка карт пациентов">
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
              </div>
            ) : section === "patients" && patientId ? (
              patient ? (
                visitId ? (
                  visit ? (
                    <EncounterEditor
                      key={visit.id}
                      patient={patient}
                      visit={visit}
                      actions={actions}
                      navigate={navigate}
                      registerGuard={registerGuard}
                    />
                  ) : (
                    <Empty title="Приём не найден" icon="calendar">
                      Вернитесь к истории пациента.
                    </Empty>
                  )
                ) : (
                  <PatientView
                    key={patient.id}
                    patient={patient}
                    actor={repository.actor}
                    actions={actions}
                    navigate={navigate}
                    tab={tab}
                    server={repository.mode === "server"}
                  />
                )
              ) : (
                <Empty
                  title="Карта недоступна"
                  icon="shield"
                  action={
                    <Button onClick={() => navigate("/patients")}>
                      К списку пациентов
                    </Button>
                  }
                >
                  Пациент не найден среди доступных вам карт.
                </Empty>
              )
            ) : section === "patients" ? (
              <PatientDirectory
                patients={actions.patients}
                navigate={navigate}
                onCreate={() => setNewPatient(true)}
              />
            ) : section === "calendar" ? (
              <Calendar patients={actions.patients} navigate={navigate} />
            ) : section === "events" ? (
              <Events
                patients={actions.patients}
                actions={actions}
                navigate={navigate}
              />
            ) : section === "sources" ? (
              <SourceLibrary />
            ) : (
              <Workday
                patients={actions.patients}
                navigate={navigate}
                onCreate={() => setNewPatient(true)}
              />
            )}
          </section>
        </main>
        <nav className={styles.mobileBottomNav} aria-label="Быстрая навигация">
          {nav
            .filter((n) => n.path !== "sources")
            .map((n) => (
              <button
                key={n.path}
                type="button"
                aria-current={section === n.path ? "page" : undefined}
                onClick={() => navigate(`/${n.path}`)}
              >
                <Icon name={n.icon} size={20} />
                <span>
                  {n.path === "workday" ? "День" : n.title}
                  {n.path === "events" && eventCount > 0
                    ? ` · ${eventCount}`
                    : ""}
                </span>
              </button>
            ))}
        </nav>
        <NewPatient
          open={newPatient}
          onClose={() => setNewPatient(false)}
          actions={actions}
          navigate={navigate}
        />
        <Modal
          open={reauthOpen}
          onClose={() => {
            setReauthOpen(false);
            setReauthPassword("");
          }}
          title="Войти повторно"
        >
          <form className={styles.form} onSubmit={reauthenticate}>
            <p className={styles.reviewText}>
              Для продолжения текущей работы войдите как {repository.actor.name}
              . Открытая карта и текст черновика сохранятся в редакторе.
            </p>
            {reauthError && <ErrorNotice>{reauthError}</ErrorNotice>}
            <Field
              label="Рабочая электронная почта"
              type="email"
              autoComplete="username"
              value={reauthEmail}
              onChange={(event) => setReauthEmail(event.target.value)}
              required
              disabled={reauthBusy}
            />
            <Field
              label="Пароль"
              type="password"
              autoComplete="current-password"
              value={reauthPassword}
              onChange={(event) => setReauthPassword(event.target.value)}
              required
              disabled={reauthBusy}
            />
            <div className={styles.formActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setReauthOpen(false);
                  setReauthPassword("");
                }}
              >
                Вернуться к черновику
              </Button>
              <Button type="submit" disabled={reauthBusy}>
                {reauthBusy ? "Входим…" : "Продолжить работу"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </SourceProvider>
  );
}
