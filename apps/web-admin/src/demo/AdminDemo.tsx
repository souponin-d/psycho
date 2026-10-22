import { useMemo, useState, type ReactNode } from "react";
import type { Scenario } from "@psycho/ui-web/contracts";
import { adminDemoSchema, adminDemoSources, type AdminDemoData } from "./data";
import {
  createSession,
  reduceSession,
  type SessionAction,
} from "./workspaceState";
import { AdminWorkspace } from "./AdminWorkspace";
import { SystemView } from "./SystemView";
import { createClinicDataset } from "./analytics/fixtures";
import { useClinicSession } from "./analytics/useClinicSession";
import { toWorkspaceData } from "./analytics/workspaceData";
import { AnalyticsDashboard } from "./analytics/AnalyticsDashboard";
import { DemoJourney } from "./analytics/DemoJourney";
import { CoordinatorDesk } from "./analytics/CoordinatorDesk";
import styles from "./analytics/analytics.module.css";

type DemoProps = {
  scenario: Scenario;
  onScenario: (scenario: Scenario) => void;
  examples?: ReactNode;
};
function AdminSession({ data, ...props }: DemoProps & { data: AdminDemoData }) {
  const dataset = useMemo(
    () => createClinicDataset(data.scenario),
    [data.scenario],
  );
  const controller = useClinicSession(dataset);
  const shellData = useMemo(
    () =>
      toWorkspaceData(data, controller.projected, controller.state.commands),
    [data, controller.projected, controller.state.commands],
  );
  const [ui, setUi] = useState(() => createSession(shellData));
  const viewController = {
    ...controller,
    reset: () => {
      controller.reset();
      setUi(createSession(toWorkspaceData(data, dataset, [])));
    },
  };
  const state = {
    ...ui,
    roles: Object.fromEntries(
      shellData.employees.map((employee) => [employee.id, employee.roles]),
    ),
    changes: controller.state.commands
      .flatMap((command) =>
        command.kind === "roles"
          ? [
              {
                id: command.id,
                actorId: data.currentEmployeeId,
                employeeId: command.employeeId,
                before: command.before,
                after: command.after,
                at: command.at,
              },
            ]
          : [],
      )
      .reverse(),
  };
  const dispatch = (action: SessionAction) => {
    const next = reduceSession(shellData, state, action);
    setUi(next);
    if (
      action.type === "saveRoles" &&
      next.changes.length > state.changes.length
    ) {
      const change = next.changes[0]!;
      controller.send({
        kind: "roles",
        employeeId: change.employeeId,
        before: change.before,
        after: change.after,
      });
    }
  };
  return (
    <AdminWorkspace data={shellData} {...props}>
      {(role, section) => {
        return (
          <>
            {controller.state.error && (
              <p className={styles.warning} role="alert">
                {controller.state.error}
              </p>
            )}
            {controller.state.notice && (
              <p className={styles.success} role="status">
                {controller.state.notice}
              </p>
            )}
            {section === "journey" ? (
              <DemoJourney controller={viewController} />
            ) : role === "coordinator" ? (
              <CoordinatorDesk
                data={shellData}
                controller={controller}
                section={section}
              />
            ) : role === "director" ? (
              <AnalyticsDashboard
                data={controller.projected}
                controller={controller}
                section={section}
              />
            ) : (
              <SystemView
                data={shellData}
                state={state}
                dispatch={dispatch}
                section={section}
              />
            )}
            {controller.storageStatus.startsWith("Не удалось сохранить") && (
              <div role="alert">
                <p>{controller.storageStatus}</p>
                <button onClick={controller.retrySave}>
                  Повторить сохранение
                </button>
              </div>
            )}
          </>
        );
      }}
    </AdminWorkspace>
  );
}
export function AdminDemo({ examples }: { examples?: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>(() => {
    const value = new URLSearchParams(window.location.search).get("dataset");
    return value === "empty" || value === "long" ? value : "normal";
  });
  const result = adminDemoSchema.safeParse(adminDemoSources[scenario]);
  const changeScenario = (next: Scenario) => {
    const url = new URL(window.location.href);
    for (const field of ["from", "to", "departmentId", "doctorId", "group"])
      url.searchParams.delete(field);
    url.searchParams.set("dataset", next);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    setScenario(next);
  };
  const props = { scenario, onScenario: changeScenario, examples };
  return result.success && result.data.scenario === scenario ? (
    <AdminSession key={scenario} data={result.data} {...props} />
  ) : (
    <AdminWorkspace data={null} {...props}>
      {() => (
        <p className="notice" role="alert">
          Ошибка демо администратора: {scenario}.json —{" "}
          {result.success
            ? "scenario не соответствует набору"
            : result.error.issues
                .map((issue) => issue.path.join("."))
                .join(", ")}
        </p>
      )}
    </AdminWorkspace>
  );
}
