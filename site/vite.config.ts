import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  define: { "import.meta.env.VITE_DEMO_SITE_HOME": JSON.stringify("../../") },
  build: {
    rolldownOptions: {
      input: {
        site: fileURLToPath(new URL("./index.html", import.meta.url)),
        doctor: fileURLToPath(new URL("./doctor/index.html", import.meta.url)),
        admin: fileURLToPath(
          new URL("./demo/admin/index.html", import.meta.url),
        ),
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.DOCTOR_API_URL ?? "http://127.0.0.1:5080",
        changeOrigin: false,
      },
    },
  },
});
