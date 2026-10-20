// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountHeroAnimation } from "../site/hero-animation.js";

let pending: Map<number, FrameRequestCallback>;
let frameId: number;
let media: EventTarget & { matches: boolean };
let intersection: IntersectionObserverCallback;

// The browser GPU boundary is unavailable in jsdom; lifecycle and DOM remain real.
function gpu() {
  return new Proxy(
    {},
    {
      get(target, key) {
        if (Reflect.has(target, key)) return Reflect.get(target, key);
        if (key === "getShaderParameter" || key === "getProgramParameter")
          return () => true;
        if (key === "getAttribLocation") return () => 0;
        if (key === "getExtension") return () => null;
        if (typeof key === "string" && key === key.toUpperCase()) return 1;
        return () => ({});
      },
    },
  );
}

function scene() {
  document.body.innerHTML = `<section data-hero-animation>
    <canvas aria-hidden="true"></canvas>
    <div data-hero-fallback role="img" aria-label="Знак Синкли"></div>
    <button data-hero-toggle hidden type="button">Приостановить анимацию</button>
  </section>`;
  return {
    root: document.querySelector<HTMLElement>("section")!,
    button: document.querySelector<HTMLButtonElement>("button")!,
    fallback: document.querySelector<HTMLElement>("[data-hero-fallback]")!,
  };
}

beforeEach(() => {
  pending = new Map();
  frameId = 0;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => gpu() as never,
  );
});

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("жизненный цикл анимации HERO", () => {
  it("сохраняет статичный знак при недоступном WebGL без неработающей кнопки", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const { root, button, fallback } = scene();
    expect(() => mountHeroAnimation(root)).not.toThrow();
    expect(fallback.hidden).toBe(false);
    expect(button.hidden).toBe(true);
    expect(pending.size).toBe(0);
  });

  it("показывает статичный знак после ошибки компиляции GPU", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(
      () => null,
    );
    const { root, button, fallback } = scene();
    const context = gpu();
    Object.defineProperty(context, "getShaderParameter", {
      value: () => false,
    });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      context as never,
    );
    expect(() => mountHeroAnimation(root)).not.toThrow();
    expect(fallback.hidden).toBe(false);
    expect(button.hidden).toBe(true);
  });

  it("соблюдает уменьшенное движение и позволяет явно включить анимацию", () => {
    media.matches = true;
    const { root, button } = scene();
    mountHeroAnimation(root);
    expect(button.hidden).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("Включить анимацию");
    expect(pending.size).toBe(0);
    button.click();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(pending.size).toBe(1);
    media.dispatchEvent(new Event("change"));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(pending.size).toBe(0);
  });

  it("останавливает кадры вне экрана и не отменяет пользовательскую паузу", () => {
    const { root, button } = scene();
    mountHeroAnimation(root);
    expect(pending.size).toBe(1);
    const visibility = (isIntersecting: boolean) =>
      intersection(
        [{ isIntersecting }] as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      );
    visibility(false);
    expect(pending.size).toBe(0);
    visibility(true);
    visibility(true);
    expect(pending.size).toBe(1);
    button.click();
    expect(pending.size).toBe(0);
    visibility(false);
    visibility(true);
    expect(pending.size).toBe(0);
  });

  it("останавливает кадры в скрытой вкладке", () => {
    const { root } = scene();
    mountHeroAnimation(root);
    expect(pending.size).toBe(1);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(0);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(1);
  });

  it("сохраняет статичный знак при потере GPU и восстанавливает анимацию", () => {
    const { root, button, fallback } = scene();
    mountHeroAnimation(root);
    const canvas = root.querySelector("canvas")!;
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(pending.size).toBe(0);
    expect(fallback.hidden).toBe(false);
    expect(button.hidden).toBe(true);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(fallback.hidden).toBe(true);
    expect(button.hidden).toBe(false);
    expect(pending.size).toBe(1);
  });

  it("освобождает кадры и обработчики при уходе со страницы", () => {
    const { root, button } = scene();
    mountHeroAnimation(root);
    expect(pending.size).toBe(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(pending.size).toBe(0);
    button.click();
    media.dispatchEvent(new Event("change"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(0);
  });
});
