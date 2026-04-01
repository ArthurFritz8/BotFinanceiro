import { defineConfig } from "vite";

const proxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/v1": {
        changeOrigin: true,
        target: proxyTarget,
      },
    },
  },
});