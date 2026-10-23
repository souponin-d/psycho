import { useRef } from "react";
import { Button } from "@psycho/ui-web";
import { adminRoles, roleLabels, type AdminDemoData } from "./data";
import {
  editableEmployee,
  type SessionAction,
  type SessionState,
} from "./workspaceState";
import { Metrics } from "./WorkspaceParts";
import styles from "./workspace.module.css";
import { timeLabel } from "./analytics/model";

export function SystemView({
  data,
  state,
  dispatch,
  section,
}: {
  data: AdminDemoData;
  state: SessionState;
  dispatch: (action: SessionAction) => void;
  section: string;
}) {
  const firstRole = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLHeadingElement>(null);
  const selected = editableEmployee(data, state.employeeId);
  const draft = selected ? (state.drafts[selected.id] ?? []) : [];
  const saved = selected ? (state.roles[selected.id] ?? []) : [];
  const dirty =
    draft.length !== saved.length ||
    draft.some((role) => !saved.includes(role));
  const roleText = (roles: typeof draft) =>
    roles.map((role) => roleLabels[role]).join(", ");
  if (section === "matrix")
    return (
      <section className={styles.panel}>
        <table
          className={styles.table}
          aria-label="Возможности рабочих пространств"
        >
          <thead>
            <tr>
              <th scope="col">Роль</th>
              <th scope="col">Основная работа</th>
              <th scope="col">Доступные данные демо</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Координатор</th>
              <td>Организационные задачи</td>
              <td>Команда и расписание</td>
            </tr>
            <tr>
              <th scope="row">Руководитель</th>
              <td>Анализ и подготовка сводок</td>
              <td>Агрегированные показатели</td>
            </tr>
            <tr>
              <th scope="row">Системный администратор</th>
              <td>Настройка сотрудников и ролей</td>
              <td>Учётные записи и события доступа</td>
            </tr>
          </tbody>
        </table>
        <p className={styles.note}>
          Переключение пространства не заменяет авторизацию. Серверная проверка
          прав в этом демо отсутствует.
        </p>
      </section>
    );
  if (section === "access")
    return (
      <section className={styles.panel}>
        {state.changes.length ? (
          <ol className={styles.log} aria-label="Журнал изменений доступа">
            {state.changes.map((change) => (
              <li key={change.id}>
                <span className={styles.small}>
                  {change.at ? timeLabel(change.at) : "Действие в этой вкладке"}{" "}
                  ·{" "}
                  {
                    data.employees.find(
                      (employee) => employee.id === change.actorId,
                    )?.name
                  }
                </span>
                <strong>
                  {
                    data.employees.find(
                      (employee) => employee.id === change.employeeId,
                    )?.name
                  }
                </strong>
                <p>
                  {roleText(change.before)} → {roleText(change.after)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>
            Изменений доступа в этой демонстрации пока нет.
          </p>
        )}
      </section>
    );
  return (
    <div className={styles.stack}>
      <Metrics
        items={[
          {
            label: "Учётные записи",
            value: data.employees.length,
            caption: "Сотрудники отделения",
          },
          {
            label: "Ваши рабочие роли",
            value: data.employees.find(
              (employee) => employee.id === data.currentEmployeeId,
            )!.roles.length,
            caption: "Одна текущая учётная запись",
          },
          {
            label: "Изменения ролей",
            value: state.changes.length,
            caption: "В этой демонстрации",
          },
        ]}
      />
      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <h2>Сотрудники отделения</h2>
            <span className={styles.small}>Всего: {data.employees.length}</span>
          </div>
          <table className={styles.table} aria-label="Сотрудники отделения">
            <thead>
              <tr>
                <th scope="col">Сотрудник</th>
                <th scope="col">Рабочие роли</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((employee) => (
                <tr
                  key={employee.id}
                  data-selected={employee.id === selected?.id}
                >
                  <th scope="row">
                    {editableEmployee(data, employee.id) ? (
                      <button
                        className={styles.textButton}
                        aria-label={`Настроить ${employee.name}`}
                        aria-pressed={employee.id === selected?.id}
                        onClick={() => {
                          dispatch({ type: "employee", id: employee.id });
                          editor.current?.focus();
                        }}
                      >
                        {employee.name}
                      </button>
                    ) : (
                      employee.name
                    )}
                    {employee.id === data.currentEmployeeId && (
                      <small>Вы · только просмотр</small>
                    )}
                  </th>
                  <td>
                    {employee.kind === "doctor"
                      ? "Врачебный веб"
                      : roleText(state.roles[employee.id] ?? [])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={styles.panel} aria-label="Редактор рабочих ролей">
          {selected ? (
            <>
              <h2 ref={editor} tabIndex={-1}>
                {selected.name}
              </h2>
              <p className={styles.small}>
                Выберите одно или несколько рабочих пространств
              </p>
              {dirty && (
                <p className={styles.small}>
                  Есть несохранённые изменения ролей
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  dispatch({ type: "saveRoles" });
                  if (!draft.length) firstRole.current?.focus();
                }}
              >
                <fieldset
                  className={styles.roleFields}
                  aria-describedby={
                    state.roleError ? "roles-error" : "roles-hint"
                  }
                >
                  <legend>Рабочие роли</legend>
                  {adminRoles.map((role, index) => (
                    <label className={styles.checkbox} key={role}>
                      <input
                        ref={index === 0 ? firstRole : undefined}
                        type="checkbox"
                        name={role}
                        checked={draft.includes(role)}
                        aria-invalid={state.roleError || undefined}
                        onChange={(event) =>
                          dispatch({
                            type: "draft",
                            roles: event.currentTarget.checked
                              ? [...draft, role]
                              : draft.filter((item) => item !== role),
                          })
                        }
                      />
                      <span>{roleLabels[role]}</span>
                    </label>
                  ))}
                </fieldset>
                <div className={styles.actions}>
                  <Button type="submit" disabled={!dirty}>
                    Сохранить роли
                  </Button>
                  {dirty && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        dispatch({ type: "draft", roles: [...saved] })
                      }
                    >
                      Отменить изменения
                    </Button>
                  )}
                </div>
                {state.roleError ? (
                  <p id="roles-error" className={styles.error} role="alert">
                    {state.roleMessage}
                  </p>
                ) : (
                  <p className={styles.feedback} role="status">
                    {state.roleMessage}
                  </p>
                )}
              </form>
              <p id="roles-hint" className={styles.note}>
                Изменение будет записано в журнал доступа.
              </p>
            </>
          ) : (
            <div className={styles.empty}>
              <h2>Нет сотрудников для настройки</h2>
              <p>
                Текущая учётная запись доступна только для просмотра.
                Переключите набор на рабочий день, чтобы назначить несколько
                ролей сотруднику.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
