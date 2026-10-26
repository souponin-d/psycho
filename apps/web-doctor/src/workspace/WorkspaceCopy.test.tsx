import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DoctorWorkspace } from "./DoctorWorkspace";

vi.mock("./repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("./repository")>();
  const { demoActor, seedPatients } = await import("./seed");
  return {
    ...original,
    demoRepository: async () => ({
      mode: "demo" as const,
      actor: demoActor,
      // Изолируем текст пациентского уведомления от приоритета новых клинических сценариев.
      list: async () =>
        seedPatients().map((p) => ({
          ...p,
          events: p.events.filter((e) => e.title === "Уведомление от пациента"),
        })),
      create: async () => {
        throw new Error("not used by this test");
      },
      execute: async () => {
        throw new Error("not used by this test");
      },
      logout: async () => {},
    }),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("показывает пациентское уведомление без служебных подписей рабочего дня", async () => {
  vi.stubGlobal("matchMedia", () =>
    Object.assign(new EventTarget(), {
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
  vi.stubGlobal("scrollTo", () => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const user = userEvent.setup();
  render(<DoctorWorkspace />);

  await user.click(
    await screen.findByRole("button", {
      name: "Открыть кабинет",
    }),
  );

  await screen.findByRole("heading", { name: "Ваш рабочий день" });

  expect(screen.queryByText("Рабочее место врача")).toBeNull();
  expect(
    screen.queryByText("Главное о пациентах, с которыми вы работаете сегодня"),
  ).toBeNull();
  expect(
    within(document.querySelector("header")!).queryByText("Рабочий день"),
  ).toBeNull();
  expect(screen.getByText("Уведомление от пациента")).toBeTruthy();
});
