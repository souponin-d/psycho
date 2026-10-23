import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { EncounterEditor, type RegisterGuard } from "./EncounterEditor";
import { applyCommand, createPatient, createVisit } from "./commands";
import { encounterLabels } from "./labels";
import { ApiError, type Repository } from "./repository";
import { useWorkspace, type WorkspaceActions } from "./useWorkspace";
import type { Actor, Command } from "./model";

const actor: Actor = {
  id: "doctor-editor-test",
  name: "Тестовый врач",
  specialty: "psychiatrist",
  clinicId: "clinic-editor-test",
};
const now = "2026-10-22T09:00:00.000Z";

function fixture(completed = false) {
  let patient = createPatient(
    { name: "Синтетический пациент", birthDate: "1990-01-01" },
    actor,
    now,
    "patient-editor-test",
  );
  const visit = createVisit("visit-editor-test", now, actor);
  visit.status = "in-progress";
  visit.notes.complaints = "Начальная запись";
  visit.notes.safetyConclusion = "Оценка проведена";
  visit.notes.conclusion = "Обсуждён план";
  visit.notes.recommendations = "Контрольный приём";
  function apply(mutation: Command["mutation"]) {
    patient = applyCommand(
      patient,
      {
        commandId: crypto.randomUUID(),
        expectedRevision: patient.revision,
        mutation,
      },
      actor,
      now,
    );
  }
  apply({ type: "visit.save", value: visit });
  if (completed) {
    apply({
      type: "consent.add",
      value: {
        id: "care",
        createdAt: now,
        author: "",
        purpose: "care",
        status: "documented",
        signedOn: "2026-10-22",
        documentReference: "Синтетический документ",
        person: "Пациент",
        scope: "Приём",
        informing: "Обсуждены условия",
      },
    });
    apply({ type: "visit.complete", id: visit.id });
  }
  return patient;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// The real editor and workspace hook use the real domain transitions. Only the
// repository transport is replaced so a response can be delayed or rejected.
async function mountEditor(
  options: {
    completed?: boolean;
    beforeExecute?: (command: Command, index: number) => Promise<void>;
  } = {},
) {
  let stored = fixture(options.completed);
  const commands: Command[] = [];
  let actions!: WorkspaceActions;
  let guard: (() => Promise<boolean>) | null = null;
  const registerGuard: RegisterGuard = (value) => {
    guard = value;
  };
  const repository: Repository = {
    mode: "server",
    actor,
    list: async () => [structuredClone(stored)],
    create: async () => {
      throw new Error("Создание карты не используется в сценарии редактора");
    },
    execute: async (id, command) => {
      if (id !== stored.id) throw new ApiError("Нет доступа", 404);
      commands.push(structuredClone(command));
      await options.beforeExecute?.(command, commands.length);
      stored = applyCommand(stored, command, actor, now);
      return structuredClone(stored);
    },
    logout: async () => {},
  };
  function Harness() {
    actions = useWorkspace(repository);
    const patient = actions.patients[0];
    return patient ? (
      <EncounterEditor
        patient={patient}
        visit={patient.visits[0]!}
        actions={actions}
        navigate={() => {}}
        registerGuard={registerGuard}
      />
    ) : (
      <p>Загрузка карты</p>
    );
  }
  await act(async () => {
    render(<Harness />);
  });
  return {
    stored: () => stored,
    commands,
    canLeave: async () => {
      let allowed = false;
      await act(async () => {
        allowed = (await guard?.()) ?? true;
      });
      return allowed;
    },
    updateFromAnotherSession: async (complaints: string) => {
      const visit = structuredClone(stored.visits[0]!);
      visit.notes.complaints = complaints;
      stored = applyCommand(
        stored,
        {
          commandId: crypto.randomUUID(),
          expectedRevision: stored.revision,
          mutation: { type: "visit.save", value: visit },
        },
        actor,
        now,
      );
      await act(async () => {
        await actions.refresh();
      });
    },
  };
}

function complaints() {
  return screen.getByRole("textbox", {
    name: encounterLabels.complaints,
  }) as HTMLTextAreaElement;
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("редактор приёма: сохранение и восстановление", () => {
  it("после ошибки сохраняет черновик в поле и повторяет запрос только по действию врача", async () => {
    vi.useFakeTimers();
    let disconnected = true;
    const editor = await mountEditor({
      beforeExecute: async () => {
        if (disconnected)
          throw new ApiError("Сервер недоступен. Повторите сохранение.", 0);
      },
    });
    fireEvent.change(complaints(), {
      target: { value: "Текст при потере связи" },
    });
    await advance(1200);
    expect(screen.getByRole("alert").textContent).toContain(
      "Сервер недоступен",
    );
    expect(complaints().value).toBe("Текст при потере связи");
    expect(editor.stored().visits[0]!.notes.complaints).toBe(
      "Начальная запись",
    );
    await advance(6000);
    expect(editor.commands).toHaveLength(1);
    disconnected = false;
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Повторить сохранение" }),
      );
    });
    expect(editor.stored().visits[0]!.notes.complaints).toBe(
      "Текст при потере связи",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Черновик сохранён",
    );
  });

  it("досохраняет текст, набранный пока предыдущий autosave ждёт ответ", async () => {
    vi.useFakeTimers();
    const firstResponse = deferred();
    const editor = await mountEditor({
      beforeExecute: async (_command, index) => {
        if (index === 1) await firstResponse.promise;
      },
    });
    fireEvent.change(complaints(), { target: { value: "Первый фрагмент" } });
    await advance(1200);
    expect(screen.getByRole("status").textContent).toContain("Сохраняется");
    fireEvent.change(complaints(), {
      target: { value: "Первый фрагмент и продолжение" },
    });
    // The second debounce expires while the first response is still pending.
    await advance(1200);
    await act(async () => {
      firstResponse.resolve();
      await firstResponse.promise;
    });
    expect(complaints().value).toBe("Первый фрагмент и продолжение");
    await advance(2400);
    expect(editor.stored().visits[0]!.notes.complaints).toBe(
      "Первый фрагмент и продолжение",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Черновик сохранён",
    );
    expect(await editor.canLeave()).toBe(true);
  });

  it("сравнивает конфликтующие тексты и освобождает переход после выбора сохранённого", async () => {
    vi.useFakeTimers();
    const editor = await mountEditor();
    fireEvent.change(complaints(), {
      target: { value: "Мой несохранённый текст" },
    });
    await editor.updateFromAnotherSession("Запись другой сессии");
    expect(
      screen.getByRole("heading", { name: "Карта изменена в другой сессии" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Сравнить записи"));
    expect(
      screen.getByText("Ваш вариант: Мой несохранённый текст"),
    ).toBeTruthy();
    expect(
      screen.getByText("Сохранённый вариант: Запись другой сессии"),
    ).toBeTruthy();
    expect(await editor.canLeave()).toBe(false);
    await advance(2400);
    expect(editor.commands).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Использовать сохранённую запись" }),
    );
    expect(complaints().value).toBe("Запись другой сессии");
    expect(await editor.canLeave()).toBe(true);
    expect(editor.commands).toHaveLength(0);
    expect(editor.stored().visits[0]!.notes.complaints).toBe(
      "Запись другой сессии",
    );
  });

  it("сохраняет выбранный локальный вариант с новой ревизией после сравнения", async () => {
    vi.useFakeTimers();
    const editor = await mountEditor();
    fireEvent.change(complaints(), {
      target: { value: "Мой согласованный вариант" },
    });
    await editor.updateFromAnotherSession("Запись другой сессии");
    const remoteRevision = editor.stored().revision;
    fireEvent.click(
      screen.getByRole("button", { name: "Продолжить с моим вариантом" }),
    );
    await advance(1200);
    expect(editor.commands[0]?.expectedRevision).toBe(remoteRevision);
    expect(editor.stored().revision).toBe(remoteRevision + 1);
    expect(editor.stored().visits[0]!.notes.complaints).toBe(
      "Мой согласованный вариант",
    );
    expect(
      screen.queryByRole("heading", { name: "Карта изменена в другой сессии" }),
    ).toBeNull();
    expect(await editor.canLeave()).toBe(true);
  });

  it("оставляет ошибку сохранения дополнения внутри открытого диалога и сохраняет введённый текст", async () => {
    const editor = await mountEditor({
      completed: true,
      beforeExecute: async (command) => {
        if (command.mutation.type === "visit.addendum")
          throw new ApiError(
            "Связь с сервером прервана. Повторите сохранение.",
            0,
          );
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить уточнение" }));
    const dialog = screen.getByRole("dialog", {
      name: "Дополнение к завершённому приёму",
    });
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Текст дополнения" }),
      { target: { value: "Новые сведения пациента" } },
    );
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Причина уточнения" }),
      { target: { value: "Уточнение анамнеза" } },
    );
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Сохранить дополнение" }),
      );
    });
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "Связь с сервером прервана",
    );
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "Текст дополнения",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Новые сведения пациента");
    expect(editor.stored().visits[0]!.addenda).toHaveLength(0);
    expect(
      screen.getByRole("dialog", { name: "Дополнение к завершённому приёму" }),
    ).toBe(dialog);
  });
});
