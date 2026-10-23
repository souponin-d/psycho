// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountHeroAnimation } from "../site/hero-animation.js";

let pending: Map<number, FrameRequestCallback>;
let frameId: number;
let media: EventTarget & { matches: boolean };
let compactMedia: EventTarget & { matches: boolean };
let intersection: IntersectionObserverCallback;

// jsdom has no GPU; lifecycle events and DOM are real.
function gpu() {
  return new Proxy(
    {},
    {
      get(target, key) {
        if (Reflect.has(target, key)) return Reflect.get(target, key);
        if (key === "getShaderParameter" || key === "getProgramParameter")
          return () => true;
        if (key === "getAttribLocation") return () => 0;
        if (typeof key === "string" && key === key.toUpperCase()) return 1;
        return () => ({});
      },
    },
  );
}
function scene() {
  document.body.innerHTML = `<section data-hero-animation><canvas aria-hidden="true"></canvas><div data-hero-fallback aria-hidden="true"></div></section>`;
  return {
    root: document.querySelector<HTMLElement>("section")!,
    fallback: document.querySelector<HTMLElement>("[data-hero-fallback]")!,
    canvas: document.querySelector("canvas")!,
  };
}
beforeEach(() => {
  pending = new Map();
  frameId = 0;
  media = Object.assign(new EventTarget(), { matches: false });
  compactMedia = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", (query: string) =>
    query.includes("prefers-reduced-motion") ? media : compactMedia,
  );
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
describe("жизненный цикл HERO без кнопки управления", () => {
  it("согласует планшетную композицию с CSS, несмотря на ширину полосы прокрутки", () => {
    const context = gpu();
    const sendUniform = vi.fn();
    Object.defineProperties(context, {
      getUniformLocation: { value: (_program: unknown, name: string) => name },
      uniform1f: { value: sendUniform },
    });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      context as never,
    );
    vi.stubGlobal("devicePixelRatio", 1);
    const { root } = scene();
    Object.defineProperties(root, {
      clientWidth: { value: 753 },
      clientHeight: { value: 540 },
    });
    compactMedia.matches = false; // 768px viewport, 15px scrollbar.
    mountHeroAnimation(root);
    expect(sendUniform).toHaveBeenCalledWith("u_compact", 0);
  });

  it("запускает сцену без удалённой кнопки и не дублирует очередь кадров", () => {
    const { root, fallback } = scene();
    mountHeroAnimation(root);
    expect(fallback.hidden).toBe(true);
    expect(pending.size).toBe(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(1);
  });
  it("сохраняет резервный знак без WebGL", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const { root, fallback } = scene();
    expect(() => mountHeroAnimation(root)).not.toThrow();
    expect(fallback.hidden).toBe(false);
    expect(pending.size).toBe(0);
  });
  it("перехватывает ошибку шейдера и оставляет резервный знак", () => {
    const context = gpu();
    const compileStatus = vi.fn(() => false);
    Object.defineProperty(context, "getShaderParameter", {
      value: compileStatus,
    });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      context as never,
    );
    const { root, fallback } = scene();
    expect(() => mountHeroAnimation(root)).not.toThrow();
    expect(compileStatus).toHaveBeenCalled();
    expect(fallback.hidden).toBe(false);
    expect(pending.size).toBe(0);
  });
  it("показывает статичную сцену при reduced motion и реагирует на смену настройки", () => {
    media.matches = true;
    const { root, fallback } = scene();
    mountHeroAnimation(root);
    expect(fallback.hidden).toBe(true);
    expect(pending.size).toBe(0);
    root.dispatchEvent(new Event("pointermove"));
    expect(pending.size).toBe(0);
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    expect(pending.size).toBe(1);
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(pending.size).toBe(0);
  });
  it("останавливается вне экрана и возобновляется без двойной очереди", () => {
    const { root } = scene();
    mountHeroAnimation(root);
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
  });
  it("не запрашивает кадры в скрытой вкладке", () => {
    const { root } = scene();
    mountHeroAnimation(root);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(0);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(1);
  });
  it("восстанавливает сцену после потери GPU", () => {
    const { root, canvas, fallback } = scene();
    mountHeroAnimation(root);
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(pending.size).toBe(0);
    expect(fallback.hidden).toBe(false);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(fallback.hidden).toBe(true);
    expect(pending.size).toBe(1);
  });
  it("приостанавливается в bfcache и продолжает после возврата", () => {
    const { root } = scene();
    mountHeroAnimation(root);
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    expect(pending.size).toBe(0);
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    expect(pending.size).toBe(1);
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    expect(pending.size).toBe(1);
  });
  it("освобождает обработчики и кадры при уходе со страницы", () => {
    const { root } = scene();
    mountHeroAnimation(root);
    expect(pending.size).toBe(1);
    window.dispatchEvent(new Event("pagehide"));
    media.dispatchEvent(new Event("change"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(0);
  });
});
