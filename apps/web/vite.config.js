import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const proxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? "http://localhost:3000";
const configuredBasePath = (process.env.VITE_BASE_PATH ?? "/").trim();
const normalizedBasePath = normalizeBasePath(configuredBasePath);

function normalizeBasePath(value) {
  if (value.length === 0 || value === "/") {
    return "/";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: normalizedBasePath,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("lightweight-charts")) {
            return "vendor-charts";
          }

          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }

          return "vendor";
        },
      },
    },
  },
  plugins: [
    VitePWA({
      devOptions: {
        enabled: true,
      },
      includeAssets: ["pwa-icon.svg", "pwa-maskable.svg", "push-handler.js"],
      workbox: {
        importScripts: ["push-handler.js"],
      },
      manifest: {
        background_color: "#f7f5ee",
        description: "Copiloto financeiro com IA para leitura de mercado em tempo real.",
        display: "standalone",
        icons: [
          {
            purpose: "any",
            sizes: "192x192",
            src: "pwa-icon.svg",
            type: "image/svg+xml",
          },
          {
            purpose: "any",
            sizes: "512x512",
            src: "pwa-icon.svg",
            type: "image/svg+xml",
          },
          {
            purpose: "maskable",
            sizes: "512x512",
            src: "pwa-maskable.svg",
            type: "image/svg+xml",
          },
        ],
        name: "BotFinanceiro Copiloto",
        scope: normalizedBasePath,
        short_name: "BotFinanceiro",
        start_url: normalizedBasePath,
        theme_color: "#0e8f7e",
      },
      registerType: "autoUpdate",
    }),
  ],
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