import { z } from "zod";
import { defaultFilter, validFilter } from "./aggregate";
import { DEMO_DAY } from "./fixtures";
import {
  addDays,
  type ClinicDataset,
  type ClinicFilter,
  type DemoCommand,
} from "./model";

const roles = z
  .array(z.enum(["coordinator", "director", "system"]))
  .min(1)
  .max(3)
  .refine((items) => new Set(items).size === items.length);
const common = {
  id: z.string().startsWith("demo-action-").max(100),
  at: z.iso.datetime(),
};
const commandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...common,
    kind: z.literal("report"),
    patientId: z.string().max(80),
    expectedId: z.string().max(120),
    day: z.iso.date(),
    mood: z.enum(["Спокойно", "Неустойчиво", "Обычно"]),
    note: z.string().max(500),
    requestContact: z.boolean(),
  }),
  z.strictObject({
    ...common,
    kind: z.enum(["accept", "respond"]),
    signalId: z.string().max(150),
  }),
  z.strictObject({
    ...common,
    kind: z.literal("schedule"),
    patientId: z.string().max(80),
    day: z.iso.date(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }),
  z.strictObject({
    ...common,
    kind: z.literal("roles"),
    employeeId: z.string().regex(/^demo-staff-0[2-5]$/),
    before: roles,
    after: roles,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("request"),
    patientId: z.string().max(80),
  }),
]);
const filterSchema = z.strictObject({
  from: z.iso.date(),
  to: z.iso.date(),
  departmentId: z.string().max(80),
  doctorId: z.string().max(80),
  group: z.string().max(100),
});
const snapshotSchema = z.strictObject({
  version: z.literal(1),
  commands: z.array(commandSchema).max(1000),
  filter: filterSchema,
});
export const staffRoles: Record<
  string,
  ("coordinator" | "director" | "system")[]
> = {
  "demo-staff-01": ["director", "coordinator", "system"],
  "demo-staff-02": ["coordinator"],
  "demo-staff-03": ["director"],
  "demo-staff-04": ["coordinator", "director"],
  "demo-staff-05": ["system"],
};
export type ClinicSession = {
  commands: DemoCommand[];
  filter: ClinicFilter;
  error: string;
  notice: string;
};
export type ClinicAction =
  | { type: "command"; command: DemoCommand }
  | { type: "filter"; patch: Partial<ClinicFilter> }
  | { type: "reset" };
export const initialClinicSession = (): ClinicSession => ({
  commands: [],
  filter: defaultFilter(),
  error: "",
  notice: "",
});

export function projectClinic(
  data: ClinicDataset,
  commands: DemoCommand[],
): ClinicDataset {
  let reports = [...data.reports],
    signals = [...data.signals],
    visits = [...data.visits];
  const seen = new Set<string>();
  for (const command of commands) {
    if (seen.has(command.id)) continue;
    seen.add(command.id);
    if (
      command.kind === "report" &&
      !reports.some((r) => r.expectedId === command.expectedId)
    ) {
      reports.push({
        id: command.id,
        patientId: command.patientId,
        expectedId: command.expectedId,
        day: command.day,
        mood: command.mood,
        note: command.note,
      });
      if (command.requestContact)
        signals.push({
          id: `signal-${command.id}`,
          patientId: command.patientId,
          day: command.day,
          title: "Запрос пациента на связь · учебный сценарий",
          status: "open",
          createdAt: command.at,
          acceptedAt: null,
          closedAt: null,
        });
    }
    if (command.kind === "accept")
      signals = signals.map((s) =>
        s.id === command.signalId && s.status === "open"
          ? { ...s, status: "accepted", acceptedAt: command.at }
          : s,
      );
    if (command.kind === "respond")
      signals = signals.map((s) =>
        s.id === command.signalId && s.status === "accepted"
          ? { ...s, status: "closed", closedAt: command.at }
          : s,
      );
    if (command.kind === "schedule")
      visits.push({
        id: command.id,
        patientId: command.patientId,
        day: command.day,
        time: command.time,
        status: "scheduled",
        kind: "Повторный",
      });
  }
  return { ...data, reports, signals, visits };
}
function invalidCommand(
  data: ClinicDataset,
  state: ClinicSession,
  command: DemoCommand,
): string | null {
  if (!commandSchema.safeParse(command).success)
    return "Некорректное демонстрационное событие.";
  if (
    !command.at.startsWith(DEMO_DAY) ||
    command.at < (state.commands.at(-1)?.at ?? `${DEMO_DAY}T00:00:00Z`)
  )
    return "Время события не соответствует часам демонстрации.";
  if (
    "patientId" in command &&
    !data.patients.some((p) => p.id === command.patientId)
  )
    return "Пациент отсутствует в этом наборе.";
  const view = projectClinic(data, state.commands);
  if (
    command.kind === "request" &&
    state.commands.some(
      (c) => c.kind === "request" && c.patientId === command.patientId,
    )
  )
    return "Запрос самоотчёта уже зафиксирован в этом сеансе.";
  if (command.kind === "report") {
    if (
      !data.expectedForms.some(
        (e) =>
          e.id === command.expectedId &&
          e.patientId === command.patientId &&
          e.day === command.day,
      ) ||
      command.day !== DEMO_DAY
    )
      return "Форма не относится к текущему пациенту и дню.";
    if (view.reports.some((r) => r.expectedId === command.expectedId))
      return "Эта форма уже получена; повторная отправка не учтена.";
  }
  if (command.kind === "accept" || command.kind === "respond") {
    const signal = view.signals.find((s) => s.id === command.signalId);
    if (
      !signal ||
      (command.kind === "accept"
        ? signal.status !== "open"
        : signal.status !== "accepted")
    )
      return "Сначала примите открытое событие; завершённое событие повторно не обрабатывается.";
  }
  if (
    command.kind === "schedule" &&
    (command.day <= DEMO_DAY ||
      command.day > addDays(DEMO_DAY, 14) ||
      view.visits.some(
        (v) =>
          v.patientId === command.patientId &&
          v.day === command.day &&
          v.time === command.time,
      ))
  )
    return "Выберите новую встречу в следующие 14 дней без повторной записи.";
  if (command.kind === "roles") {
    if (data.scenario === "empty")
      return "В этом наборе нет сотрудника для настройки.";
    const before = [...staffRoles[command.employeeId]!];
    for (const item of state.commands)
      if (item.kind === "roles" && item.employeeId === command.employeeId)
        before.splice(0, before.length, ...item.after);
    if (
      before.length !== command.before.length ||
      before.some((r) => !command.before.includes(r))
    )
      return "Роли изменились; обновите редактор.";
    if (
      before.length === command.after.length &&
      before.every((r) => command.after.includes(r))
    )
      return "Набор ролей не изменился.";
  }
  return null;
}
export function reduceClinicSession(
  data: ClinicDataset,
  state: ClinicSession,
  action: ClinicAction,
): ClinicSession {
  if (action.type === "reset") return initialClinicSession();
  if (action.type === "filter")
    return {
      ...state,
      filter: validFilter(data, { ...state.filter, ...action.patch }),
      error: "",
      notice: "",
    };
  if (state.commands.some((c) => c.id === action.command.id)) return state;
  const error = invalidCommand(data, state, action.command);
  if (error) return { ...state, error, notice: "" };
  if (state.commands.length >= 1000)
    return {
      ...state,
      error:
        "Лимит учебного сеанса достигнут. Сохраните отчёт и начните новый сеанс.",
    };
  return {
    ...state,
    commands: [...state.commands, action.command],
    error: "",
    notice: "Учебное событие записано. Связанные показатели обновлены.",
  };
}
export function serializeClinicSession(state: ClinicSession) {
  return JSON.stringify({
    version: 1,
    commands: state.commands,
    filter: state.filter,
  });
}
export function restoreClinicSession(
  raw: string | null,
  data: ClinicDataset,
): ClinicSession {
  if (!raw) return initialClinicSession();
  try {
    if (raw.length > 750000) throw new Error("size");
    const saved = snapshotSchema.parse(JSON.parse(raw));
    let state = initialClinicSession();
    for (const command of saved.commands) {
      const next = reduceClinicSession(data, state, {
        type: "command",
        command,
      });
      if (next.commands.length !== state.commands.length + 1)
        throw new Error("invalid transition");
      state = next;
    }
    return {
      ...state,
      filter: validFilter(data, saved.filter),
      error: "",
      notice: "",
    };
  } catch {
    return {
      ...initialClinicSession(),
      error:
        "Не удалось восстановить сохранение демо. Исходные данные открыты; сохранение не будет перезаписано до явного сброса.",
    };
  }
}
