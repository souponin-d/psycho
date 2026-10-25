// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { within } from "@testing-library/react";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
  document.body.innerHTML = "";
  document.documentElement.classList.remove("js-ready");
});

it("сохраняет навигацию, экраны экосистемы, мозаики и вкладки тарифов", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  const source = readFileSync(resolve("site/index.html"), "utf8");
  document.body.innerHTML = new DOMParser().parseFromString(
    source,
    "text/html",
  ).body.innerHTML;
  await import("../site/app.js");

  const menu = document.querySelector<HTMLButtonElement>(".menu-toggle")!;
  menu.click();
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(menu);

  const survey = within(
    document.querySelector<HTMLElement>(".audience-survey")!,
  );
  const mosaics = survey.getAllByRole("img");
  expect(mosaics).toHaveLength(3);
  for (const [index, count] of [46, 39, 31].entries()) {
    const mosaic = mosaics[index]!;
    expect(mosaic.getAttribute("aria-label")).toContain(`${count} из 107`);
    expect(mosaic.children).toHaveLength(107);
    expect(mosaic.querySelectorAll(".is-filled")).toHaveLength(count);
  }

  const doctor = document.querySelector<HTMLElement>('[data-step="1"]')!;
  vi.spyOn(doctor, "getBoundingClientRect").mockReturnValue({
    top: window.innerHeight / 2 - 100,
    height: 200,
  } as DOMRect);
  window.dispatchEvent(new Event("scroll"));
  await vi.runOnlyPendingTimersAsync();
  const doctorScene = document.querySelector<HTMLElement>('[data-scene="1"]')!;
  expect(doctorScene.getAttribute("aria-hidden")).toBe("false");
  expect(
    document.querySelector('[data-scene="0"]')!.getAttribute("aria-hidden"),
  ).toBe("true");
  within(doctorScene).getByRole("button", { name: "Лечение и план" }).click();
  expect(doctorScene.querySelector("img")!.getAttribute("src")).toContain(
    "plan.jpg",
  );
  expect(doctorScene.querySelector("img")!.alt).toBe("Лечение и план");
  expect(document.querySelector("#role-doctor a")!.getAttribute("href")).toBe(
    "doctor/",
  );
  expect(document.querySelector("#role-clinic a")!.getAttribute("href")).toBe(
    "demo/admin/",
  );
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.querySelector(".stage-head")).toBeNull();

  const tariffs = within(document.querySelector<HTMLElement>("#monetization")!);
  const investor = tariffs.getByRole("tab", { name: "Для инвестора" });
  investor.click();
  await Promise.resolve();
  expect(document.querySelector("#monetization-title")!.textContent).toBe(
    "Монетизация",
  );
  expect(
    document.querySelector<HTMLElement>(".tariffs-clinic-copy")!.hidden,
  ).toBe(true);
  expect(
    document.querySelector("#panel-clinic")!.getAttribute("aria-hidden"),
  ).toBe("true");
  investor.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
  );
  await Promise.resolve();
  expect(document.querySelector("#monetization-title")!.textContent).toBe(
    "Тарифы",
  );
  expect(
    document.querySelector<HTMLElement>(".tariffs-clinic-copy")!.hidden,
  ).toBe(false);
  expect(document.activeElement?.id).toBe("tab-clinic");

  vi.spyOn(
    document.querySelector("header")!,
    "getBoundingClientRect",
  ).mockReturnValue({ height: 80 } as DOMRect);
  vi.spyOn(
    document.querySelector("#team")!,
    "getBoundingClientRect",
  ).mockReturnValue({ top: 600 } as DOMRect);
  document
    .querySelector<HTMLAnchorElement>('#site-nav a[href="#team"]')!
    .click();
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 520, behavior: "instant" });
  expect(document.querySelector("#pilot .pilot-contact")).not.toBeNull();
  expect(document.querySelector("#team .team-contact")).toBeNull();
});
