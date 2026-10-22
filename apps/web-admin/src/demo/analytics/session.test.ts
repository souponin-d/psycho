import { describe, it, expect } from "vitest";
import { createClinicDataset, DEMO_DAY, DEMO_PATIENT } from "./fixtures";
import { defaultFilter, analyseClinic } from "./aggregate";
import {
  initialClinicSession,
  reduceClinicSession,
  projectClinic,
  restoreClinicSession,
  serializeClinicSession,
} from "./session";
import type { DemoCommand } from "./model";
const report: DemoCommand = {
  id: "demo-action-1",
  kind: "report",
  patientId: DEMO_PATIENT,
  expectedId: `form-${DEMO_PATIENT}-${DEMO_DAY}`,
  day: DEMO_DAY,
  mood: "Обычно",
  note: "Учебная запись",
  requestContact: true,
  at: "2026-10-20T12:00:00Z",
};
describe("сквозной сеанс клиники", () => {
  it("не дублирует организационный запрос с новым техническим ID", () => {
    const data = createClinicDataset("normal");
    const command: DemoCommand = {
      id: "demo-action-1",
      kind: "request",
      patientId: DEMO_PATIENT,
      at: "2026-10-20T12:00:00Z",
    };
    const state = reduceClinicSession(data, initialClinicSession(), {
      type: "command",
      command,
    });
    const repeated = reduceClinicSession(data, state, {
      type: "command",
      command: { ...command, id: "demo-action-2" },
    });
    expect(repeated.commands).toHaveLength(1);
  });
  it("проводит форму через единые данные, приём и ответ; повтор не удваивает запись", () => {
    const data = createClinicDataset("normal");
    const original = JSON.stringify(data);
    const before = analyseClinic(data, defaultFilter());
    let state = reduceClinicSession(data, initialClinicSession(), {
      type: "command",
      command: report,
    });
    expect(
      analyseClinic(projectClinic(data, state.commands), defaultFilter())
        .summary.reports,
    ).toBe(before.summary.reports + 1);
    expect(
      reduceClinicSession(data, state, { type: "command", command: report }),
    ).toBe(state);
    state = reduceClinicSession(data, state, {
      type: "command",
      command: { ...report, id: "demo-action-2" },
    });
    expect(state.commands).toHaveLength(1);
    for (const [index, kind] of ["accept", "respond"].entries())
      state = reduceClinicSession(data, state, {
        type: "command",
        command: {
          id: `demo-action-${index + 3}`,
          kind: kind as "accept" | "respond",
          signalId: "signal-demo-action-1",
          at: `2026-10-20T12:0${index + 1}:00Z`,
        },
      });
    expect(
      projectClinic(data, state.commands).signals.find(
        (s) => s.id === "signal-demo-action-1",
      )?.status,
    ).toBe("closed");
    expect(JSON.stringify(data)).toBe(original);
  });
  it("не принимает ответ до принятия, чужую форму или запись неизвестного пациента", () => {
    const data = createClinicDataset("normal");
    let state = initialClinicSession();
    state = reduceClinicSession(data, state, {
      type: "command",
      command: { ...report, patientId: "unknown" },
    });
    expect(state.commands).toHaveLength(0);
    expect(state.error).toBeTruthy();
    state = reduceClinicSession(data, initialClinicSession(), {
      type: "command",
      command: report,
    });
    state = reduceClinicSession(data, state, {
      type: "command",
      command: {
        id: "demo-action-2",
        kind: "respond",
        signalId: "signal-demo-action-1",
        at: "2026-10-20T12:01:00Z",
      },
    });
    expect(state.commands).toHaveLength(1);
  });
  it("восстанавливает события и фильтры и объясняет повреждённое сохранение", () => {
    const data = createClinicDataset("normal");
    let state = reduceClinicSession(data, initialClinicSession(), {
      type: "command",
      command: report,
    });
    state = reduceClinicSession(data, state, {
      type: "filter",
      patch: { departmentId: "demo-dept-2" },
    });
    const restored = restoreClinicSession(serializeClinicSession(state), data);
    expect(restored.commands).toEqual(state.commands);
    expect(restored.filter).toEqual(state.filter);
    const bad = restoreClinicSession("{not-json", data);
    expect(bad.commands).toHaveLength(0);
    expect(bad.error).toContain("сохранение");
    expect(
      restoreClinicSession(JSON.stringify({ version: 999, commands: [] }), data)
        .error,
    ).toBeTruthy();
  });
  it("сбрасывает несовместимого врача и сохраняет пустую выборку без деления на ноль", () => {
    const data = createClinicDataset("normal");
    let state = initialClinicSession();
    state = reduceClinicSession(data, state, {
      type: "filter",
      patch: { doctorId: data.doctors[0]!.id },
    });
    state = reduceClinicSession(data, state, {
      type: "filter",
      patch: { departmentId: "demo-dept-3" },
    });
    expect(state.filter.doctorId).toBe("all");
    expect(
      reduceClinicSession(data, state, { type: "reset" }).commands,
    ).toHaveLength(0);
  });
});
