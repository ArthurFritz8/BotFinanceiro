import { appendFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.MONITOR_BASE_URL ?? "").trim().replace(/\/$/, "");
const internalToken = (process.env.MONITOR_INTERNAL_TOKEN ?? "").trim();
const maxLatencyMs = Number.parseInt(process.env.MONITOR_MAX_LATENCY_MS ?? "4000", 10);

if (!baseUrl) {
  console.error("MONITOR_BASE_URL nao configurado. Defina a Actions variable MONITOR_BASE_URL.");
  process.exit(1);
}

if (Number.isNaN(maxLatencyMs) || maxLatencyMs <= 0) {
  console.error("MONITOR_MAX_LATENCY_MS invalido. Use inteiro positivo em milissegundos.");
  process.exit(1);
}

/** @typedef {{ name: string; path: string; headers?: Record<string, string>; validate?: (body: unknown) => boolean }} SmokeCheck */

/** @type {SmokeCheck[]} */
const checks = [
  {
    name: "health",
    path: "/health",
    validate: (body) => Boolean(body && typeof body === "object" && body.status === "success"),
  },
  {
    name: "ready",
    path: "/ready",
    validate: (body) => Boolean(body && typeof body === "object" && body.status === "success"),
  },
  {
    name: "copilot-history",
    path: "/v1/copilot/history?sessionId=monitoring_session_ci&limit=1",
    validate: (body) => {
      if (!body || typeof body !== "object") {
        return false;
      }

      const safeBody = /** @type {{ status?: unknown; data?: { sessionId?: unknown } }} */ (body);
      return safeBody.status === "success" && safeBody.data?.sessionId === "monitoring_session_ci";
    },
  },
];

if (internalToken) {
  checks.push({
    name: "internal-copilot-audit",
    path: "/internal/copilot/audit/history?limit=1",
    headers: {
      "x-internal-token": internalToken,
    },
    validate: (body) => Boolean(body && typeof body === "object" && body.status === "success"),
  });

  checks.push({
    name: "internal-market-navigator-modules",
    path: "/internal/health/market-navigator/modules",
    headers: {
      "x-internal-token": internalToken,
    },
    validate: (body) => {
      if (!body || typeof body !== "object") {
        return false;
      }

      const safeBody = /** @type {{ status?: unknown; data?: { modules?: unknown } }} */ (body);

      return (
        safeBody.status === "success"
        && Array.isArray(safeBody.data?.modules)
        && safeBody.data.modules.length > 0
      );
    },
  });
}

async function runCheck(check) {
  const requestUrl = `${baseUrl}${check.path}`;
  const startedAt = performance.now();

  let error = null;
  let latencyMs = 0;
  let ok = false;
  let statusCode = 0;

  try {
    const response = await fetch(requestUrl, {
      headers: check.headers,
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });

    statusCode = response.status;

    let body = null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    ok = response.ok && (check.validate ? check.validate(body) : true);

    if (!ok) {
      const statusSuffix = response.ok ? "payload invalido" : `status ${response.status}`;
      error = `${check.name}: ${statusSuffix}`;
    }
  } catch (rawError) {
    error = rawError instanceof Error ? rawError.message : String(rawError);
  } finally {
    latencyMs = Number((performance.now() - startedAt).toFixed(2));
  }

  const latencyWithinBudget = latencyMs <= maxLatencyMs;

  if (ok && !latencyWithinBudget) {
    ok = false;
    error = `${check.name}: latencia ${latencyMs}ms acima do limite ${maxLatencyMs}ms`;
  }

  return {
    error,
    latencyMs,
    name: check.name,
    ok,
    statusCode,
    url: requestUrl,
  };
}

const results = await Promise.all(checks.map((check) => runCheck(check)));
const hasFailures = results.some((result) => !result.ok);

for (const result of results) {
  const status = result.ok ? "OK" : "FAIL";
  const detail = result.error ? ` - ${result.error}` : "";
  console.log(`[${status}] ${result.name} (${result.latencyMs}ms, status=${result.statusCode})${detail}`);
}

const summaryLines = [
  "## Monitoring Smoke",
  "",
  `- Base URL: ${baseUrl}`,
  `- Limite de latencia: ${maxLatencyMs}ms`,
  `- Resultado: ${hasFailures ? "FAIL" : "OK"}`,
  "",
  "| Check | Status | HTTP | Latencia (ms) |",
  "| --- | --- | --- | --- |",
  ...results.map((result) => {
    const label = result.ok ? "OK" : "FAIL";
    return `| ${result.name} | ${label} | ${result.statusCode} | ${result.latencyMs} |`;
  }),
  "",
];

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join("\n")}\n`);
}

if (hasFailures) {
  process.exit(1);
}
