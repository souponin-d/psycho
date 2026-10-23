import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrendChart } from "./Charts";

it("позволяет с клавиатуры открыть записи единственного дня", async () => {
  const user = userEvent.setup();
  const openDay = vi.fn();
  render(
    <TrendChart
      rows={[
        {
          day: "2026-10-20",
          reports: 1,
          visits: 0,
          available: true,
          previous: 0,
        },
      ]}
      onDay={openDay}
    />,
  );
  await user.click(screen.getByText("Даты и таблица значений"));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByLabelText("Дата на графике"));
  await user.tab({ shift: true });
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Открыть записи" }),
  );
  await user.keyboard("{Enter}");
  expect(openDay).toHaveBeenCalledExactlyOnceWith("2026-10-20");
});
