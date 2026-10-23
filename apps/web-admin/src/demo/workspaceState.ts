import {
  adminRoles,
  periodDayCount,
  type AdminDemoData,
  type AdminRole,
} from "./data";

export type AccessChange = {
  id: string;
  actorId: string;
  employeeId: string;
  before: AdminRole[];
  after: AdminRole[];
  at?: string;
};
export type SessionState = {
  completed: string[];
  expandedTask: string | null;
  taskMessage: string;
  periodId: string;
  reportOpen: boolean;
  employeeId: string | null;
  roles: Record<string, AdminRole[]>;
  drafts: Record<string, AdminRole[]>;
  changes: AccessChange[];
  roleMessage: string;
  roleError: boolean;
};
export type SessionAction =
  | { type: "toggleTask" | "completeTask"; id: string }
  | { type: "period" | "employee"; id: string }
  | { type: "draft"; roles: AdminRole[] }
  | { type: "saveRoles" | "toggleReport" };

export function editableEmployee(data: AdminDemoData, id: string | null) {
  return data.employees.find(
    (employee) =>
      employee.id === id &&
      employee.kind === "staff" &&
      employee.id !== data.currentEmployeeId,
  );
}
export function createSession(data: AdminDemoData): SessionState {
  const roles = Object.fromEntries(
    data.employees.map((employee) => [employee.id, [...employee.roles]]),
  );
  return {
    completed: [],
    expandedTask: null,
    taskMessage: "",
    periodId: data.periods[0]!.id,
    reportOpen: false,
    employeeId:
      data.employees.find((employee) => editableEmployee(data, employee.id))
        ?.id ?? null,
    roles,
    drafts: Object.fromEntries(
      Object.entries(roles).map(([id, list]) => [id, [...list]]),
    ),
    changes: [],
    roleMessage: "",
    roleError: false,
  };
}
export function reduceSession(
  data: AdminDemoData,
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "toggleTask":
      return data.tasks.some((task) => task.id === action.id)
        ? {
            ...state,
            expandedTask: state.expandedTask === action.id ? null : action.id,
          }
        : state;
    case "completeTask": {
      const task = data.tasks.find((item) => item.id === action.id);
      if (!task || state.completed.includes(task.id)) return state;
      return {
        ...state,
        completed: [...state.completed, task.id],
        expandedTask: null,
        taskMessage: `${task.completedTitle}. Событие добавлено в журнал.`,
      };
    }
    case "period":
      return data.periods.some((period) => period.id === action.id)
        ? { ...state, periodId: action.id }
        : state;
    case "toggleReport":
      return { ...state, reportOpen: !state.reportOpen };
    case "employee":
      return editableEmployee(data, action.id)
        ? { ...state, employeeId: action.id, roleMessage: "", roleError: false }
        : state;
    case "draft": {
      if (
        !editableEmployee(data, state.employeeId) ||
        action.roles.some((role) => !adminRoles.includes(role))
      )
        return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [state.employeeId!]: adminRoles.filter((role) =>
            action.roles.includes(role),
          ),
        },
        roleMessage: "",
        roleError: false,
      };
    }
    case "saveRoles": {
      const employee = editableEmployee(data, state.employeeId);
      if (!employee) return state;
      const after = state.drafts[employee.id] ?? [];
      const before = state.roles[employee.id] ?? [];
      if (!after.length)
        return {
          ...state,
          roleError: true,
          roleMessage: "Выберите хотя бы одну рабочую роль.",
        };
      if (
        before.length === after.length &&
        before.every((role) => after.includes(role))
      )
        return {
          ...state,
          roleError: false,
          roleMessage: "Набор ролей не изменился.",
        };
      return {
        ...state,
        roles: { ...state.roles, [employee.id]: [...after] },
        changes: [
          {
            id: `demo-access-change-${state.changes.length + 1}`,
            actorId: data.currentEmployeeId,
            employeeId: employee.id,
            before: [...before],
            after: [...after],
          },
          ...state.changes,
        ],
        roleError: false,
        roleMessage: "Рабочие роли сохранены. Изменение записано в журнал.",
      };
    }
  }
}
export function getPeriodSummary(data: AdminDemoData, id: string) {
  const period =
    data.periods.find((item) => item.id === id) ?? data.periods[0]!;
  return {
    period,
    reports: period.series.points.reduce(
      (sum, point) => sum + (point.value ?? 0),
      0,
    ),
    knownDays: period.series.points.filter((point) => point.value !== null)
      .length,
    days: periodDayCount(period),
    patients: data.team.reduce((sum, office) => sum + office.patients, 0),
  };
}
