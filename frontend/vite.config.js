import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const backendTarget = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const proxy = {
  "/api": {
    target: backendTarget,
    changeOrigin: true,
    secure: false,
  },
};
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0", port: 5173, strictPort: true, proxy },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
    proxy,
    allowedHosts: true,
  },
});
