import { useReducer, useState, type ReactNode } from "react";
import type { Scenario } from "@psycho/ui-web/contracts";
import { adminDemoSchema, adminDemoSources, type AdminDemoData } from "./data";
import {
  createSession,
  reduceSession,
  type SessionAction,
  type SessionState,
} from "./workspaceState";
import { AdminWorkspace } from "./AdminWorkspace";
import { CoordinatorView } from "./CoordinatorView";
import { DirectorView } from "./DirectorView";
import { SystemView } from "./SystemView";

type DemoProps = {
  scenario: Scenario;
  onScenario: (scenario: Scenario) => void;
  examples?: ReactNode;
};
function AdminSession({ data, ...props }: DemoProps & { data: AdminDemoData }) {
  const [state, dispatch] = useReducer(
    (state: SessionState, action: SessionAction) =>
      reduceSession(data, state, action),
    data,
    createSession,
  );
  return (
    <AdminWorkspace data={data} {...props}>
      {(role, section) => {
        const viewProps = { data, state, dispatch, section };
        return role === "coordinator" ? (
          <CoordinatorView {...viewProps} />
        ) : role === "director" ? (
          <DirectorView {...viewProps} />
        ) : (
          <SystemView {...viewProps} />
        );
      }}
    </AdminWorkspace>
  );
}
export function AdminDemo({ examples }: { examples?: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const result = adminDemoSchema.safeParse(adminDemoSources[scenario]);
  const props = { scenario, onScenario: setScenario, examples };
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
