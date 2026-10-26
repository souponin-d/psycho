import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui/Elements";
import css from "./SourceReader.module.css";

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

// Restricted Markdown subset. React escapes all source text; HTML and images
// remain text, and source content never becomes executable application code.
function inline(text: string): ReactNode[] {
  return text
    .split(/(!?\[[^\]]*\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) => {
      const link = /^\[([^\]]*)\]\(([^\s)]+)\)$/.exec(part);
      if (link) {
        const href = safeUrl(link[2]!);
        return href ? (
          <a key={i} href={href} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        ) : (
          part
        );
      }
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i}>{part.slice(1, -1)}</code>;
      return part;
    });
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
const separator = (line: string) =>
  cells(line).every((cell) => /^:?-{3,}:?$/.test(cell));

export function SourceMarkdown({ text }: { text: string }) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    const key = i;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(line)) {
      const content: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!))
        content.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key}>
          <code>{content.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const Heading = `h${Math.min(6, heading[1]!.length + 1)}` as
        "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(<Heading key={key}>{inline(heading[2]!)}</Heading>);
      i++;
      continue;
    }
    if (line.includes("|") && lines[i + 1] && separator(lines[i + 1]!)) {
      const headers = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes("|"))
        rows.push(cells(lines[i++]!));
      const columnCount = Math.max(
        headers.length,
        ...rows.map((row) => row.length),
      );
      while (headers.length < columnCount) headers.push("");
      blocks.push(
        <div key={key} className={css.table}>
          <table>
            <thead>
              <tr>
                {headers.map((cell, n) => (
                  <th key={n} scope="col">
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n}>
                  {headers.map((_, c) => (
                    <td key={c}>{inline(row[c] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const list = /^\s*(?:([-*+])|\d+[.)])\s+(.+)$/.exec(line);
    if (list) {
      const List = list[1] ? "ul" : "ol";
      const items: ReactNode[] = [];
      const firstNumber = /^\s*(\d+)/.exec(line);
      while (i < lines.length) {
        const item = /^\s*(?:([-*+])|\d+[.)])\s+(.+)$/.exec(lines[i]!);
        if (!item || !!item[1] !== !!list[1]) break;
        items.push(<li key={i++}>{inline(item[2]!)}</li>);
      }
      blocks.push(
        <List
          key={key}
          start={firstNumber ? Number(firstNumber[1]) : undefined}
        >
          {items}
        </List>,
      );
      continue;
    }
    const paragraph = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(?:#{1,6}\s|\s*```|\s*(?:[-*+]|\d+[.)])\s)/.test(lines[i]!) &&
      !(lines[i]!.includes("|") && lines[i + 1] && separator(lines[i + 1]!))
    )
      paragraph.push(lines[i++]!);
    blocks.push(<p key={key}>{inline(paragraph.join("\n"))}</p>);
  }
  return (
    <article className={css.document} aria-label="Текст источника">
      {blocks}
    </article>
  );
}

type ReaderState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error"; message: string };

export function SourceReader({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReaderState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const response = await fetch(
          `/api/sources/${encodeURIComponent(id)}/file`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            response.status === 409
              ? "Редакция источника изменилась. Обратитесь к администратору."
              : response.status === 404
                ? "Текст источника пока недоступен."
                : "Не удалось загрузить текст. Повторите попытку.",
          );
        if (
          !/^text\/(?:plain|markdown)(?:;|$)/i.test(
            response.headers.get("content-type") ?? "",
          )
        )
          throw new Error(
            "Не удалось загрузить текст. Проверьте сессию и повторите попытку.",
          );
        const text = await response.text();
        if (!controller.signal.aborted)
          setState(
            text.trim()
              ? { status: "ready", text }
              : { status: "error", message: "Текст источника пуст." },
          );
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить текст.",
          });
      }
    })();
    return () => controller.abort();
  }, [id, attempt]);
  if (state.status === "loading") return <p role="status">Загрузка текста…</p>;
  if (state.status === "error")
    return (
      <div>
        <p role="alert">{state.message}</p>
        <Button
          variant="ghost"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Повторить
        </Button>
      </div>
    );
  return <SourceMarkdown text={state.text} />;
}
