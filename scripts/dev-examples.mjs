import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @param {{command: string, args: string[], cwd?: string}[]} commands */
export async function supervise(commands) {
  if (!commands.length) return 1;
  const children = [];
  let stopping = false;
  let exitCode = 1;
  let forceTimer;
  function stop(code) {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
    forceTimer = setTimeout(() => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
    }, 3000);
    forceTimer.unref();
  }
  const onSignal = () => stop(0);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    await Promise.all(
      commands.map(
        ({ command, args, cwd }) =>
          new Promise((done) => {
            const child = spawn(command, args, {
              cwd,
              stdio: "inherit",
              shell: false,
              windowsHide: true,
            });
            children.push(child);
            child.on("error", (error) => {
              console.error(`Не удалось запустить сервер: ${error.message}`);
              stop(1);
            });
            child.on("exit", (code) => stop(code || 1));
            child.on("close", () => done(undefined));
          }),
      ),
    );
    return exitCode;
  } finally {
    clearTimeout(forceTimer);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(import.meta.url);
  const vite = join(
    dirname(require.resolve("vite/package.json")),
    "bin/vite.js",
  );
  console.log(
    "Примеры врача: http://127.0.0.1:8767/#/examples\nПримеры администратора: http://127.0.0.1:8768/#/examples\nCtrl+C завершает оба сервера.",
  );
  process.exitCode = await supervise([
    {
      command: process.execPath,
      args: [vite, "--host", "127.0.0.1", "--port", "8767", "--strictPort"],
      cwd: join(root, "apps/web-doctor"),
    },
    {
      command: process.execPath,
      args: [vite, "--host", "127.0.0.1", "--port", "8768", "--strictPort"],
      cwd: join(root, "apps/web-admin"),
    },
  ]);
}
