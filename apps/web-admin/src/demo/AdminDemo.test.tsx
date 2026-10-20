import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../app/App";
import { adminDemoSources } from "./data";

describe("демо администратора", () => {
  it("показывает ошибку повреждённого набора вместо нулевой сводки", () => {
    const previous = adminDemoSources.normal;
    try {
      adminDemoSources.normal = { schemaVersion: 2 };
      render(<App />);
      expect(screen.getByRole("alert").textContent).toContain("normal.json");
      expect(
        screen.queryByRole("region", { name: "Показатели отделения" }),
      ).toBeNull();
    } finally {
      adminDemoSources.normal = previous;
    }
  });
});
