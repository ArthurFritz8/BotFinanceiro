import { defineConfig } from "vite";

const proxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? "http://localhost:3000";
const configuredBasePath = (process.env.VITE_BASE_PATH ?? "/").trim();

function normalizeBasePath(value) {
  if (value.length === 0 || value === "/") {
    return "/";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: normalizeBasePath(configuredBasePath),
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