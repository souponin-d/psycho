import { useRef } from "react";
import { Button } from "@psycho/ui-web";
import type { AdminDemoData } from "./data";
import type { SessionAction, SessionState } from "./workspaceState";
import { Events, Metrics, Team } from "./WorkspaceParts";
import styles from "./workspace.module.css";

export function CoordinatorView({
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
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const open = data.tasks.length - state.completed.length;
  const current = data.employees.find(
    (employee) => employee.id === data.currentEmployeeId,
  )!;
  const events = [
    ...state.completed
      .slice()
      .reverse()
      .map((id) => {
        const task = data.tasks.find((item) => item.id === id)!;
        return {
          id: `demo-completed-${id}`,
          date: "Действие в этой вкладке",
          title: task.completedTitle,
          body: `${current.name} · организационная проверка завершена. Исходные сведения не изменены.`,
        };
      }),
    ...data.events,
  ];
  if (section === "events")
    return (
      <section className={styles.panel}>
        <Events events={events} label="Организационные события" />
      </section>
    );
  if (section === "team")
    return (
      <section className={styles.panel}>
        <Team data={data} />
      </section>
    );
  return (
    <div className={styles.stack}>
      <Metrics
        items={[
          {
            label: "Открытые задачи",
            value: open,
            caption: "Организационные вопросы",
          },
          {
            label: "На сопровождении",
            value: data.team.reduce((sum, office) => sum + office.patients, 0),
            caption: `Снимок: ${data.snapshot}`,
          },
          {
            label: "Врачи отделения",
            value: data.team.length,
            caption: "Текущий состав команды",
          },
        ]}
      />
      <section className={styles.panel} aria-labelledby="task-heading">
        <div className={styles.sectionHeading}>
          <h2 id="task-heading">Требует внимания</h2>
          <span className={styles.small}>
            {open ? `Открыто: ${open}` : "Все задачи выполнены"}
          </span>
        </div>
        {data.tasks.length ? (
          <ul className={styles.tasks}>
            {data.tasks.map((task) => {
              const completed = state.completed.includes(task.id);
              const expanded = state.expandedTask === task.id;
              return (
                <li key={task.id}>
                  <div className={styles.task} data-completed={completed}>
                    <div>
                      <h3>{task.title}</h3>
                      <p>{task.description}</p>
                      <span className={styles.small}>{task.due}</span>
                    </div>
                    <Button
                      variant="secondary"
                      ref={(element) => {
                        if (element) triggers.current.set(task.id, element);
                        else triggers.current.delete(task.id);
                      }}
                      aria-expanded={expanded}
                      aria-controls={`details-${task.id}`}
                      aria-label={
                        completed
                          ? `Выполнено · ${task.completedTitle}`
                          : undefined
                      }
                      onClick={() =>
                        dispatch({ type: "toggleTask", id: task.id })
                      }
                    >
                      {completed ? "Выполнено" : "Открыть задачу"}
                    </Button>
                  </div>
                  {expanded && (
                    <div className={styles.detail} id={`details-${task.id}`}>
                      <p>{task.detail}</p>
                      <p className={styles.small}>
                        Ответственный:{" "}
                        {
                          data.employees.find(
                            (employee) => employee.id === task.assigneeId,
                          )?.name
                        }
                      </p>
                      <div className={styles.actions}>
                        <Button
                          disabled={completed}
                          onClick={() => {
                            dispatch({ type: "completeTask", id: task.id });
                            triggers.current.get(task.id)?.focus();
                          }}
                        >
                          Отметить выполненной
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            dispatch({ type: "toggleTask", id: task.id });
                            triggers.current.get(task.id)?.focus();
                          }}
                        >
                          Закрыть детали
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.empty}>
            <h3>Организационных задач пока нет</h3>
            <p>
              В этом наборе очередь пуста. В рабочем дне доступны два
              законченных сценария.
            </p>
          </div>
        )}
        <p className={styles.feedback} role="status">
          {state.taskMessage}
        </p>
      </section>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <h2>Расписание кабинетов</h2>
          <span className={styles.small}>Всего: {data.team.length}</span>
        </div>
        <Team data={data} />
      </section>
    </div>
  );
}
