import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Development: the API runs on 9925, the web dev server proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:9925" } },
});
