// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { URL } from "node:url";
import { build } from "vite";

describe("общая публикация сайта и демо", () => {
  it("собирает оба приложения и их ресурсы рядом с лендингом", async () => {
    const output = await mkdtemp(join(tmpdir(), "psycho-site-demo-"));
    try {
      await build({
        root: resolve("site"),
        base: "./",
        logLevel: "silent",
        build: { outDir: output, emptyOutDir: true },
      });
      const landing = new DOMParser().parseFromString(
        await readFile(join(output, "index.html"), "utf8"),
        "text/html",
      );
      const hrefs = Array.from(
        landing.querySelectorAll<HTMLAnchorElement>("a[href]"),
        (link) =>
          new URL(link.getAttribute("href")!, "https://demo.test/project/"),
      );
      for (const [role, title] of [
        ["doctor", "Синкли · Веб врача"],
        ["admin", "Синкли · Административный веб"],
      ] as const) {
        expect(
          hrefs.some((url) => url.pathname === `/project/demo/${role}/`),
        ).toBe(true);
        const entry = join(output, "demo", role, "index.html");
        const document = new DOMParser().parseFromString(
          await readFile(entry, "utf8"),
          "text/html",
        );
        expect(document.title).toBe(title);
        const assets = document.querySelectorAll(
          "script[src],link[rel=stylesheet][href],link[rel=modulepreload][href]",
        );
        expect(assets.length).toBeGreaterThan(0);
        for (const asset of assets) {
          const source =
            asset.getAttribute("src") ?? asset.getAttribute("href")!;
          const url = new URL(
            source,
            `https://demo.test/project/demo/${role}/`,
          );
          expect(url.origin).toBe("https://demo.test");
          expect(url.pathname.startsWith("/project/")).toBe(true);
          const file = resolve(dirname(entry), source);
          expect((await stat(file)).isFile()).toBe(true);
        }
      }
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  }, 30_000);
});
