import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import {
  dotnet,
  environment,
  apiDirectory,
  run,
  apiAssembly,
} from "./doctor-runtime.mjs";

const child = spawn(dotnet, [apiAssembly], {
  cwd: apiDirectory,
  env: {
    ...environment(),
    ASPNETCORE_ENVIRONMENT: "Development",
    ASPNETCORE_URLS: "http://127.0.0.1:5080",
  },
  stdio: ["ignore", "ignore", "inherit"],
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null)
      throw new Error("API exited before readiness.");
    try {
      if ((await fetch("http://127.0.0.1:5080/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(500);
  }
  if (!ready) throw new Error("API readiness timed out.");
  run(process.execPath, ["scripts/verify-doctor-api.mjs"], {
    env: environment(),
  });
} finally {
  child.kill();
}
