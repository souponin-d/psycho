import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPatient } from "./commands";
import { demoActor } from "./seed";
import type { PatientRecord, PlanItem } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { AdherencePanel } from "./AdherencePanel";
import {
  adherenceSummary,
  applyAdherenceMutation,
  reconcileAdherence,
  type AdherenceMutation,
  type AdherenceState,
} from "./adherence";

const now = "2026-10-26T09:00:00.000Z";

it("подставляет часовой пояс устройства в новое расписание и сохраняет прежний формат API", async () => {
  const offset = vi
    .spyOn(Date.prototype, "getTimezoneOffset")
    .mockReturnValue(-330);
  try {
    const p = patient(),
      mutate = vi.fn().mockResolvedValue(p);
    const actions = {
      actor: demoActor,
      busy: false,
      mutate,
    } as unknown as WorkspaceActions;
    render(
      createElement(AdherencePanel, { patient: p, actions, actor: demoActor }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Указать расписание" }));
    expect(
      (screen.getByLabelText("Часовой пояс") as HTMLSelectElement).value,
    ).toBe("330");
    fireEvent.change(screen.getByLabelText(/Время приёма через запятую/), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText(/Последний день расписания/), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(
      screen.getByLabelText(/Основание расписания \/ изменения/),
      { target: { value: "Согласовано" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить расписание" }),
    );
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0]![1].value.offsetMinutes).toBe(330);
  } finally {
    offset.mockRestore();
  }
});

it("сохраняет часовой пояс существующего расписания при другом часовом поясе устройства", () => {
  const offset = vi
    .spyOn(Date.prototype, "getTimezoneOffset")
    .mockReturnValue(-330);
  try {
    const p = run(patient(), schedule());
    const actions = {
      actor: demoActor,
      busy: false,
      mutate: vi.fn(),
    } as unknown as WorkspaceActions;
    render(
      createElement(AdherencePanel, { patient: p, actions, actor: demoActor }),
    );
    fireEvent.click(screen.getByText("Расписание и история"));
    fireEvent.click(screen.getByRole("button", { name: "Изменить время" }));
    expect(
      (screen.getByLabelText("Часовой пояс") as HTMLSelectElement).value,
    ).toBe("180");
  } finally {
    offset.mockRestore();
  }
});
afterEach(() => vi.useRealTimers());
type Subject = PatientRecord & { adherence?: AdherenceState };
function patient(): Subject {
  const p = createPatient(
    { name: "Пациент расписания", birthDate: "1990-01-01" },
    demoActor,
    "2026-10-20T00:00:00.000Z",
    "adherence",
  );
  p.plan.push({
    id: "medicine",
    createdAt: "2026-10-20T00:00:00.000Z",
    author: demoActor.name,
    visitId: "",
    kind: "medication",
    title: "Синтетическое назначение",
    details: "Указания врача",
    dose: "Назначенная доза",
    schedule: "По согласованному режиму",
    startDate: "2026-10-20",
    endDate: "",
    dueDate: "",
    status: "confirmed",
    confirmedAt: "2026-10-20T00:00:00.000Z",
    confirmedBy: demoActor.name,
    changeReason: "",
    replacesId: "",
    instructionUrl: "",
    patientInstructions: "",
    sourceIds: [],
    rationale: "Синтетический пример",
  } satisfies PlanItem);
  return p;
}
function schedule(extra: Record<string, unknown> = {}): AdherenceMutation {
  return {
    type: "adherence.schedule",
    value: {
      id: "schedule",
      expectedVersion: 0,
      planId: "medicine",
      times: ["09:00", "21:00"],
      offsetMinutes: 180,
      effectiveFrom: "2026-10-25T00:00:00.000Z",
      endDate: "2026-10-28",
      reason: "Уточнено время",
      ...extra,
    },
  } as AdherenceMutation;
}
function record(
  plannedAt: string,
  status = "taken",
  extra: Record<string, unknown> = {},
): AdherenceMutation {
  return {
    type: "adherence.record",
    value: {
      scheduleId: "schedule",
      scheduleVersion: 1,
      plannedAt,
      status,
      reportedAt: now,
      provenance: "patient",
      reason: "",
      expectedVersion: 0,
      ...extra,
    },
  } as AdherenceMutation;
}
function run(p: Subject, m: AdherenceMutation, time = now) {
  applyAdherenceMutation(p, m, demoActor, time);
  return p;
}
function summary(p: Subject, time = now) {
  return adherenceSummary(p, "2026-10-25", "2026-10-26", time);
}

describe("самоотчётная приверженность привязана к наступившим слотам снимка назначения", () => {
  it("не выдумывает пропуски из отсутствия отметок и не учитывает будущее", () => {
    const p = run(patient(), schedule());
    expect(summary(p)).toMatchObject({
      applicable: 3,
      taken: 0,
      missed: 0,
      unknown: 3,
      notApplicable: 0,
      percentage: 0,
      coverage: 0,
    });
    expect(summary(p).slots.map((slot) => slot.plannedAt)).toEqual([
      "2026-10-25T06:00:00.000Z",
      "2026-10-25T18:00:00.000Z",
      "2026-10-26T06:00:00.000Z",
    ]);
    expect(p.adherence!.records).toHaveLength(0);
  });
  it("вычисляет отдельные процент и покрытие, хранит причину неприменимости", () => {
    const p = run(patient(), schedule());
    run(p, record("2026-10-25T06:00:00.000Z"));
    run(p, record("2026-10-25T18:00:00.000Z", "missed"));
    expect(summary(p)).toMatchObject({
      applicable: 3,
      taken: 1,
      missed: 1,
      unknown: 1,
      percentage: 100 / 3,
      coverage: 200 / 3,
    });
    expect(() =>
      run(p, record("2026-10-26T06:00:00.000Z", "not-applicable")),
    ).toThrow();
    run(
      p,
      record("2026-10-26T06:00:00.000Z", "not-applicable", {
        reason: "Врач исключил приём в этот день",
      }),
    );
    expect(summary(p)).toMatchObject({
      applicable: 2,
      taken: 1,
      missed: 1,
      unknown: 0,
      notApplicable: 1,
      percentage: 50,
      coverage: 100,
    });
  });
  it("исправление имеет ожидаемую версию и сохраняет все исходные ответы", () => {
    const p = run(patient(), schedule());
    run(p, record("2026-10-25T06:00:00.000Z", "missed"));
    expect(() => run(p, record("2026-10-25T06:00:00.000Z"))).toThrow();
    expect(() =>
      run(
        p,
        record("2026-10-25T06:00:00.000Z", "taken", { expectedVersion: 1 }),
      ),
    ).toThrow();
    run(
      p,
      record("2026-10-25T06:00:00.000Z", "taken", {
        expectedVersion: 1,
        reason: "Пациент уточнил первоначальную отметку",
      }),
    );
    expect(p.adherence!.records).toHaveLength(1);
    expect(p.adherence!.records[0]).toMatchObject({
      version: 2,
      status: "taken",
    });
    expect(p.adherence!.records[0]!.history.map((h) => h.status)).toEqual([
      "missed",
      "taken",
    ]);
  });
  it("частичный день и смена версии не дублируют будущие слоты", () => {
    const p = run(
      patient(),
      schedule({ effectiveFrom: "2026-10-25T12:00:00.000Z" }),
    );
    expect(summary(p).applicable).toBe(2);
    run(
      p,
      schedule({ expectedVersion: 1, times: ["15:00"], effectiveFrom: now }),
    );
    expect(summary(p).applicable).toBe(2);
    const later = summary(p, "2026-10-26T13:00:00.000Z");
    expect(later.slots.map((s) => [s.scheduleVersion, s.plannedAt])).toEqual([
      [1, "2026-10-25T18:00:00.000Z"],
      [1, "2026-10-26T06:00:00.000Z"],
      [2, "2026-10-26T12:00:00.000Z"],
    ]);
    expect(p.adherence!.schedules).toHaveLength(2);
    expect(p.adherence!.schedules[0]!.effectiveUntil).toBe(now);
    expect(() =>
      run(p, schedule({ expectedVersion: 1, effectiveFrom: now })),
    ).toThrow();
  });
  it("остановка и смена дозы закрывают будущее, не меняя снимок и историю", () => {
    for (const change of ["stopped", "completed", "dose"]) {
      const p = run(patient(), schedule());
      run(p, record("2026-10-25T06:00:00.000Z"));
      if (change === "dose") p.plan[0]!.dose = "Другая согласованная доза";
      else p.plan[0]!.status = change as "stopped" | "completed";
      reconcileAdherence(p, demoActor, now);
      reconcileAdherence(p, demoActor, "2026-10-26T13:00:00.000Z");
      expect(p.adherence!.schedules[0]!.effectiveUntil).toBe(now);
      expect(summary(p, "2026-10-28T23:00:00.000Z").applicable).toBe(3);
      expect(p.adherence!.schedules[0]!.planSnapshot.dose).toBe(
        "Назначенная доза",
      );
      expect(p.adherence!.records).toHaveLength(1);
    }
  });
  it("смена дозы требует нового подтверждённого снимка расписания", () => {
    const p = run(patient(), schedule());
    p.plan[0]!.dose = "Новая доза";
    reconcileAdherence(p, demoActor, now);
    run(
      p,
      schedule({ expectedVersion: 1, effectiveFrom: now, times: ["15:00"] }),
    );
    expect(p.adherence!.schedules[0]!.planSnapshot.dose).toBe(
      "Назначенная доза",
    );
    expect(p.adherence!.schedules[1]!.planSnapshot.dose).toBe("Новая доза");
  });
  it("учитывает локальную календарную дату и границы суток при разных смещениях", () => {
    const p = run(
      patient(),
      schedule({
        times: ["00:30"],
        offsetMinutes: 180,
        effectiveFrom: "2026-10-24T20:00:00.000Z",
      }),
    );
    expect(
      adherenceSummary(p, "2026-10-25", "2026-10-25", now).slots[0]!.plannedAt,
    ).toBe("2026-10-24T21:30:00.000Z");
    const west = run(
      patient(),
      schedule({
        times: ["23:30"],
        offsetMinutes: -300,
        effectiveFrom: "2026-10-24T20:00:00.000Z",
      }),
    );
    expect(
      adherenceSummary(west, "2026-10-25", "2026-10-25", now).slots[0]!
        .plannedAt,
    ).toBe("2026-10-26T04:30:00.000Z");
  });
  it("пустой знаменатель не выглядит как 0% или 100%", () => {
    expect(
      adherenceSummary(patient(), "2026-10-25", "2026-10-26", now),
    ).toMatchObject({
      applicable: 0,
      percentage: null,
      coverage: null,
      unknown: 0,
    });
  });
  it("явное неизвестное не становится пропуском, полная неприменимость даёт пустой знаменатель", () => {
    const p = run(patient(), schedule());
    for (const time of [
      "2026-10-25T06:00:00.000Z",
      "2026-10-25T18:00:00.000Z",
      "2026-10-26T06:00:00.000Z",
    ])
      run(p, record(time, "unknown"));
    expect(summary(p)).toMatchObject({ unknown: 3, missed: 0, coverage: 0 });
    for (const time of [
      "2026-10-25T06:00:00.000Z",
      "2026-10-25T18:00:00.000Z",
      "2026-10-26T06:00:00.000Z",
    ])
      run(
        p,
        record(time, "not-applicable", {
          expectedVersion: 1,
          reason: "Врач уточнил применимость",
        }),
      );
    expect(summary(p)).toMatchObject({
      applicable: 0,
      notApplicable: 3,
      percentage: null,
      coverage: null,
    });
    p.adherence!.records[0]!.reason = "";
    expect(summary(p)).toMatchObject({
      applicable: 1,
      notApplicable: 2,
      unknown: 1,
    });
  });
  it("граница закрытия исключается, удалённое назначение не удаляет прошлые отметки", () => {
    const p = run(patient(), schedule());
    run(p, record("2026-10-25T06:00:00.000Z"));
    p.plan = [];
    reconcileAdherence(p, demoActor, "2026-10-26T06:00:00.000Z");
    expect(summary(p)).toMatchObject({ applicable: 2, taken: 1, unknown: 1 });
    expect(p.adherence!.records[0]!.history).toHaveLength(1);
  });
  it("отклоняет неверные часы/даты/смещения, дубли, подмену слота и будущие отметки", () => {
    for (const extra of [
      { times: [] },
      { times: ["9:00"] },
      { times: ["24:00"] },
      { times: ["09:60"] },
      { times: ["09:00", "09:00"] },
      { offsetMinutes: 181 },
      { offsetMinutes: 841 },
      { offsetMinutes: true },
      { endDate: "2026-02-30" },
      { effectiveFrom: "2026-02-30T00:00:00Z" },
      { effectiveFrom: "2026-10-19T00:00:00Z" },
    ])
      expect(() => run(patient(), schedule(extra))).toThrow();
    const p = run(patient(), schedule());
    for (const command of [
      record("2026-10-26T18:00:00.000Z"),
      record("2026-10-25T06:01:00.000Z"),
      record("2026-10-25T06:00:00.000Z", "taken", { scheduleVersion: 2 }),
      record("2026-10-25T06:00:00.000Z", "taken", {
        reportedAt: "2026-10-24T00:00:00Z",
      }),
      record("2026-10-25T06:00:00.000Z", "taken", {
        reportedAt: "2026-10-27T00:00:00Z",
      }),
    ])
      expect(() => run(p, command)).toThrow();
    expect(() =>
      adherenceSummary(p, "2026-10-27", "2026-10-25", now),
    ).toThrow();
  });
  it("не принимает неподтверждённое/немедикаментозное назначение и параллельный дубликат", () => {
    for (const status of ["draft", "stopped", "completed"]) {
      const p = patient();
      p.plan[0]!.status = status as PlanItem["status"];
      expect(() => run(p, schedule())).toThrow();
    }
    const p = run(patient(), schedule());
    expect(() => run(p, schedule({ id: "another" }))).toThrow();
    expect(() =>
      run(
        p,
        schedule({
          expectedVersion: 1,
          effectiveFrom: "2026-10-26T08:00:00.000Z",
        }),
      ),
    ).toThrow();
  });
});

it("UI сохраняет отметку ровно для выбранного слота, не меняя расписание", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  const p = run(patient(), schedule());
  const mutate = vi.fn().mockResolvedValue(p);
  const actions = {
    actor: demoActor,
    busy: false,
    mutate,
  } as unknown as WorkspaceActions;
  render(
    createElement(AdherencePanel, { patient: p, actions, actor: demoActor }),
  );
  const user = userEvent.setup();
  await user.click(screen.getByText("Отметки приёма (3)"));
  await user.click(
    screen.getAllByRole("button", { name: "Добавить отметку" })[0]!,
  );
  const dialog = screen.getByRole("dialog", { name: "Отметка приёма" });
  await user.selectOptions(
    within(dialog).getByLabelText("Статус приёма", { exact: false }),
    "taken",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Сохранить отметку" }),
  );
  expect(mutate).toHaveBeenCalledWith(
    p.id,
    {
      type: "adherence.record",
      value: {
        scheduleId: "schedule",
        scheduleVersion: 1,
        plannedAt: "2026-10-25T06:00:00.000Z",
        status: "taken",
        reportedAt: now,
        provenance: "patient",
        reason: "",
        expectedVersion: 0,
      },
    },
    p.revision,
  );
  expect(p.adherence!.records).toHaveLength(0);
});

it("UI начала по умолчанию отправляет будущую границу минуты, а не устаревшее время открытия", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  const p = patient();
  const mutate = vi.fn().mockResolvedValue(p);
  const actions = {
    actor: demoActor,
    busy: false,
    mutate,
  } as unknown as WorkspaceActions;
  render(
    createElement(AdherencePanel, { patient: p, actions, actor: demoActor }),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Указать расписание" }));
  const dialog = screen.getByRole("dialog", { name: "Расписание приёма" });
  await user.type(
    within(dialog).getByLabelText("Время приёма через запятую", {
      exact: false,
    }),
    "09:00, 21:00",
  );
  await user.type(
    within(dialog).getByLabelText("Последний день расписания", {
      exact: false,
    }),
    "2026-10-28",
  );
  await user.type(
    within(dialog).getByLabelText("Основание расписания / изменения", {
      exact: false,
    }),
    "Согласовано время",
  );
  vi.setSystemTime("2026-10-26T09:02:17.000Z");
  await user.click(
    within(dialog).getByRole("button", { name: "Сохранить расписание" }),
  );
  expect(mutate.mock.calls[0]?.[1]).toMatchObject({
    type: "adherence.schedule",
    value: {
      planId: "medicine",
      times: ["09:00", "21:00"],
      offsetMinutes: 180,
      effectiveFrom: "2026-10-26T09:03:00.000Z",
      endDate: "2026-10-28",
      expectedVersion: 0,
    },
  });
});
