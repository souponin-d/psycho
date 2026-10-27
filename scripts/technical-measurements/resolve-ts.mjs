// Resolve the existing extensionless TS imports for Node-only measurement scripts.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z]+$/i.test(specifier) &&
      context.parentURL
    ) {
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        const candidate = new URL(specifier + suffix, context.parentURL);
        if (existsSync(candidate)) return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
