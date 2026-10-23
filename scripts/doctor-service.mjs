import {
  dotnet,
  environment,
  run,
  root,
  apiAssembly,
  apiDirectory,
} from "./doctor-runtime.mjs";
import path from "node:path";
const mode = process.argv[2] ?? "run";
if (mode === "build")
  run(dotnet, ["build", "apps/doctor-api", "--nologo"], {
    env: {
      ...process.env,
      DOTNET_CLI_TELEMETRY_OPTOUT: "1",
      DOTNET_CLI_HOME: path.join(root, ".cache", "dotnet-home"),
    },
  });
else
  run(dotnet, [apiAssembly, ...(mode === "provision" ? ["--provision"] : [])], {
    cwd: apiDirectory,
    env: environment(),
  });
