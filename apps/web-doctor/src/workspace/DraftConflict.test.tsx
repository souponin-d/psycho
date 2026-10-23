import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ProfileForm, EpisodeForm } from "./PatientForms";
import { CarePlan, PlanForm } from "./CarePlan";
import { Documents } from "./Documents";
import { applyCommand } from "./commands";
import { seedPatients, demoActor } from "./seed";
import type { Mutation, PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";

afterEach(cleanup);

function fixture() {
  let stored = seedPatients(new Date("2026-10-22T09:00:00Z"))[0]!;
  const mutate = vi.fn(
    async (id: string, mutation: Mutation, expectedRevision?: number) => {
      expect(id).toBe(stored.id);
      stored = applyCommand(
        stored,
        {
          commandId: crypto.randomUUID(),
          expectedRevision: expectedRevision ?? stored.revision,
          mutation,
        },
        demoActor,
        "2026-10-22T10:00:00Z",
      );
      return stored;
    },
  );
  const actions = {
    actor: demoActor,
    busy: false,
    mutate,
  } as unknown as WorkspaceActions;
  return {
    actions,
    mutate,
    get patient() {
      return stored;
    },
    changed(change: (patient: PatientRecord) => void) {
      stored = structuredClone(stored);
      stored.revision++;
      change(stored);
      return stored;
    },
  };
}

describe("Редактирование после обновления карты в другом окне", () => {
  it("сохраняет профиль после несвязанного обновления, не теряя введённый текст", async () => {
    const f = fixture();
    const props = { actions: f.actions, onClose: vi.fn() };
    const view = render(<ProfileForm patient={f.patient} {...props} />);
    fireEvent.change(screen.getByLabelText("Аллергии и непереносимость"), {
      target: { value: "Проверено врачом" },
    });
    const latest = f.changed((p) => {
      p.reports = [];
    });
    view.rerender(<ProfileForm patient={latest} {...props} />);
    expect(screen.queryByLabelText("Сравнение изменений")).toBeNull();
    fireEvent.submit(
      screen.getByLabelText("Аллергии и непереносимость").closest("form")!,
    );
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(f.mutate.mock.calls[0]![2]).toBe(latest.revision);
    expect(f.patient.profile.allergies).toBe("Проверено врачом");
  });

  it("не перезаписывает чужой профиль до явного сравнения и выбора своего варианта", async () => {
    const f = fixture();
    const props = { actions: f.actions, onClose: vi.fn() };
    const view = render(<ProfileForm patient={f.patient} {...props} />);
    fireEvent.change(screen.getByLabelText("Аллергии и непереносимость"), {
      target: { value: "Мой уточнённый анамнез" },
    });
    const latest = f.changed((p) => {
      p.profile.allergies = "Уточнение второго врача";
    });
    view.rerender(<ProfileForm patient={latest} {...props} />);
    expect(screen.getByText("Уточнение второго врача")).toBeTruthy();
    fireEvent.submit(
      screen.getByLabelText("Аллергии и непереносимость").closest("form")!,
    );
    expect(f.mutate).not.toHaveBeenCalled();
    expect(
      (
        screen.getByLabelText(
          "Аллергии и непереносимость",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Мой уточнённый анамнез");
    fireEvent.click(
      screen.getByRole("button", { name: "Использовать мои изменения" }),
    );
    fireEvent.submit(
      screen.getByLabelText("Аллергии и непереносимость").closest("form")!,
    );
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(f.mutate.mock.calls[0]![2]).toBe(latest.revision);
    expect(f.patient.profile.allergies).toBe("Мой уточнённый анамнез");
  });

  it("позволяет загрузить актуальный эпизод вместо устаревшего черновика", async () => {
    const f = fixture();
    const props = {
      actions: f.actions,
      onClose: vi.fn(),
      actor: demoActor,
      episode: f.patient.episodes[0],
    };
    const view = render(<EpisodeForm patient={f.patient} {...props} />);
    fireEvent.change(screen.getByLabelText(/Название \/ повод наблюдения/), {
      target: { value: "Локальный повод" },
    });
    const latest = f.changed((p) => {
      p.episodes[0]!.title = "Актуальный повод";
    });
    view.rerender(<EpisodeForm patient={latest} {...props} />);
    fireEvent.submit(
      screen.getByLabelText(/Название \/ повод наблюдения/).closest("form")!,
    );
    expect(f.mutate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Загрузить актуальные данные" }),
    );
    expect(
      (
        screen.getByLabelText(
          /Название \/ повод наблюдения/,
        ) as HTMLInputElement
      ).value,
    ).toBe("Актуальный повод");
    fireEvent.submit(
      screen.getByLabelText(/Название \/ повод наблюдения/).closest("form")!,
    );
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(f.patient.episodes[0]!.title).toBe("Актуальный повод");
  });

  it("не подтверждает назначение, содержание которого изменилось после открытия проверки", async () => {
    const f = fixture();
    f.changed((p) => {
      p.plan[0]!.status = "draft";
    });
    const view = render(<CarePlan patient={f.patient} actions={f.actions} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Проверить и подтвердить" })[0]!,
    );
    const latest = f.changed((p) => {
      p.plan[0]!.details = "Изменённое содержание назначения";
    });
    view.rerender(<CarePlan patient={latest} actions={f.actions} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Подтверждаю решение" }),
    );
    expect(f.mutate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(f.patient.plan[0]!.status).toBe("draft");
  });

  it("не позволяет редактировать назначение, подтверждённое другим врачом при открытой форме", async () => {
    const f = fixture();
    f.changed((p) => {
      p.plan[0]!.status = "draft";
    });
    const props = {
      actions: f.actions,
      onClose: vi.fn(),
      existing: f.patient.plan[0],
    };
    const view = render(<PlanForm patient={f.patient} {...props} />);
    const latest = f.changed((p) => {
      p.plan[0]!.status = "confirmed";
    });
    view.rerender(<PlanForm patient={latest} {...props} />);
    expect(
      screen.queryByRole("button", { name: "Использовать мои изменения" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Загрузить актуальные данные" }),
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Сохранить черновик" })
        .closest("form")!,
    );
    expect(f.mutate).not.toHaveBeenCalled();
  });

  it("сохраняет локальную проверку документа при конфликте и загружает актуальные факты по выбору", async () => {
    const f = fixture();
    f.changed((p) => {
      p.documents = [
        {
          id: "document-conflict",
          createdAt: "2026-10-22T09:00:00Z",
          author: demoActor.name,
          title: "Синтетическая выписка",
          documentDate: "2026-10-22",
          issuer: "Тестовая организация",
          text: "Жалобы: усталость",
          status: "unverified",
          exclusionReason: "",
          facts: [
            {
              id: "fact",
              field: "Жалобы",
              quote: "усталость",
              value: "Усталость",
              confirmed: false,
            },
          ],
        },
      ];
    });
    const view = render(<Documents patient={f.patient} actions={f.actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Оригинал и факты" }));
    fireEvent.change(screen.getByLabelText("Формулировка врача"), {
      target: { value: "Моя формулировка" },
    });
    const latest = f.changed((p) => {
      p.documents[0]!.facts[0]!.value = "Формулировка коллеги";
    });
    view.rerender(<Documents patient={latest} actions={f.actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить проверку" }));
    expect(f.mutate).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Формулировка врача") as HTMLTextAreaElement)
        .value,
    ).toBe("Моя формулировка");
    fireEvent.click(
      screen.getByRole("button", { name: "Загрузить актуальные данные" }),
    );
    expect(
      (screen.getByLabelText("Формулировка врача") as HTMLTextAreaElement)
        .value,
    ).toBe("Формулировка коллеги");
  });
});
