import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SourceLibrary, SourceLinks, SourceProvider } from "./SourceLibrary";
import { SourceMarkdown, SourceReader } from "./SourceReader";
import { sourceById } from "./sources";

afterEach(() => vi.unstubAllGlobals());

it("скрывает исторические карточки, сохраняя старые ссылки и открытие с клавиатуры", async () => {
  const user = userEvent.setup();
  render(
    <SourceProvider server={false}>
      <SourceLibrary />
      <SourceLinks ids={["S05"]} />
    </SourceProvider>,
  );
  expect(
    screen.queryByRole("button", { name: sourceById("S05")!.title }),
  ).toBeTruthy();
  const cards = screen
    .getAllByRole("button")
    .filter((button) => button.className.includes("card"));
  expect(
    cards.some(
      (card) => card.getAttribute("aria-label") === sourceById("S05")!.title,
    ),
  ).toBe(false);
  const source = screen.getByRole("button", { name: sourceById("S01")!.title });
  source.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(within(screen.getByRole("dialog")).queryByText("Проверка")).toBeNull();
  await user.keyboard("{Escape}");
  await user.click(
    screen.getByRole("button", { name: sourceById("S05")!.title }),
  );
  expect(
    within(screen.getByRole("dialog")).getByText("Исторический документ"),
  ).toBeTruthy();
});

it("загружает имеющийся Markdown через проверяемый серверный источник", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response("# Полный текст\n\nСодержание шкалы", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(
    <SourceProvider server>
      <SourceLinks ids={["S23"]} />
    </SourceProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: sourceById("S23")!.title }),
  );
  expect(
    await screen.findByRole("heading", { name: "Полный текст" }),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/sources/S23/file",
    expect.objectContaining({ credentials: "same-origin" }),
  );
});

it("показывает текст безопасно без HTML, изображений и опасных ссылок", () => {
  const { container } = render(
    <SourceMarkdown
      text={
        "# Заголовок\n\n<script>alert(1)</script>\n\n[опасно](javascript:alert)\n\n![image](https://example.org/track)\n\n| Поле | Значение |\n| --- | --- |\n| A | B |\n\n[Источник](https://example.org)"
      }
    />,
  );
  expect(screen.getByRole("heading", { name: "Заголовок" })).toBeTruthy();
  expect(container.querySelector("script, img, iframe")).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(screen.getByRole("table")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Источник" }).getAttribute("href"),
  ).toBe("https://example.org/");
});

it("не показывает страницу входа или текст другой редакции вместо документа", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("<html>Вход</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    ),
  );
  const user = userEvent.setup();
  render(
    <SourceProvider server>
      <SourceLinks ids={["S23"]} />
    </SourceProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: sourceById("S23")!.title }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Не удалось загрузить текст"),
  );
  expect(screen.queryByText("Вход")).toBeNull();
});

it("сообщает о смене редакции и позволяет повторить загрузку", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 409 }))
    .mockResolvedValueOnce(
      new Response("# Проверенный текст", {
        headers: { "Content-Type": "text/plain" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<SourceReader id="S23" />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Редакция источника изменилась",
  );
  await user.click(screen.getByRole("button", { name: "Повторить" }));
  expect(
    await screen.findByRole("heading", { name: "Проверенный текст" }),
  ).toBeTruthy();
});

it("отменяет загрузку закрытого источника", () => {
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const { unmount } = render(<SourceReader id="S23" />);
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
});

it("не запрашивает PDF как Markdown", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(
    <SourceProvider server>
      <SourceLinks ids={["S01"]} />
    </SourceProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: sourceById("S01")!.title }),
  );
  expect(
    screen
      .getByRole("link", { name: "Открыть исходный документ" })
      .getAttribute("href"),
  ).toBe("/api/sources/S01/file");
  expect(fetcher).not.toHaveBeenCalled();
});
