import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    proxy: {
      "/api": {
        target: process.env.DOCTOR_API_URL ?? "http://127.0.0.1:5080",
        changeOrigin: false,
      },
    },
  },
});
