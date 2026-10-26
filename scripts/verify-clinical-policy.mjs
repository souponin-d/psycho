import { dotnet, environment, run } from "./doctor-runtime.mjs";
run(
  dotnet,
  ["run", "--project", "tests/doctor-policy/Doctor.Policy.Checks.csproj"],
  { env: environment() },
);
