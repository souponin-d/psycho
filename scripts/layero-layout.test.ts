import { expect, it } from "vitest";
import fs from "node:fs";
it("packages the existing complete static frontend with a dependency-free Node API runtime", () => {
  const c = JSON.parse(
    fs.readFileSync(new URL("../layero.json", import.meta.url), "utf8"),
  );
  expect(c.apiPrefix).toBe("/api");
  expect(c.runtime).toBe("node_web");
  expect(c.frontend).toMatchObject({
    root: ".",
    framework: "generic",
    install: "npm ci --ignore-scripts",
    build: "npm run build",
    output: "dist",
    node: "24",
  });
  expect(c.backend).toMatchObject({
    root: "deployment/layero",
    start: "node server.mjs",
    install: "node --version",
    node: "24",
  });
  expect(c.backend).not.toHaveProperty("buildCommand");
  const pkg = JSON.parse(
    fs.readFileSync(
      new URL("../deployment/layero/package.json", import.meta.url),
      "utf8",
    ),
  );
  expect(Object.keys(pkg.dependencies ?? {})).toHaveLength(0);
  expect(Object.keys(pkg.devDependencies ?? {})).toHaveLength(0);
});
