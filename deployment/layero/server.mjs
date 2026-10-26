import { createApiProxy, proxyConfig } from "./proxy.mjs";
const config = proxyConfig();
const server = createApiProxy(config);
server.listen(config.port, "0.0.0.0", () =>
  console.log(`Syncli API proxy ready on port ${config.port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
