const SPOT_MARGIN_MODE = "spot_margin";

function toFiniteNumber(value, fallback = Number.NaN) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeOperationalMode(value) {
  const mode = String(value ?? SPOT_MARGIN_MODE).toLowerCase();
  return mode === SPOT_MARGIN_MODE ? SPOT_MARGIN_MODE : "manual_only";
}

function createCheck({ blocking = true, detail, id, label, ok }) {
  return {
    blocking,
    detail,
    id,
    label,
    ok: Boolean(ok),
  };
}

function guidanceForStatus(status) {
  if (status === "armed") {
    return "Auto Guard armado para paper trading: todos os bloqueios criticos estao liberados.";
  }

  if (status === "manual-only") {
    return "Auto Guard em revisao manual: plano forte, mas ainda sem permissao para automacao.";
  }

  return "Auto Guard bloqueado: uma trava critica impede qualquer automacao neste ciclo.";
}

export function buildExecutionAutomationGuardSnapshot(input = {}) {
  const executionGate = input.executionGate ?? {};
  const executionPlan = input.executionPlan ?? {};
  const executionQuality = input.executionQuality ?? {};
  const journalSummary = input.journalSummary ?? {};
  const snapshot = input.snapshot ?? {};
  const operationalMode = normalizeOperationalMode(input.operationalMode);
  const qualityScore = toFiniteNumber(executionQuality.score, 0);
  const journalResolved = Math.max(0, Math.trunc(toFiniteNumber(journalSummary.resolved, 0)));
  const qualityPrime = executionQuality.status === "prime" && qualityScore >= 82;
  const qualityQualified = qualityPrime || (executionQuality.status === "qualified" && qualityScore >= 68);
  const journalReady = executionQuality.journalReady === true || journalResolved >= 5;
  const checks = [
    createCheck({
      detail: `feed ${snapshot.mode ?? "unknown"}`,
      id: "live-feed",
      label: "Feed live",
      ok: snapshot.mode === "live",
    }),
    createCheck({
      detail: operationalMode,
      id: "operational-mode",
      label: "Modo spot/margem",
      ok: operationalMode === SPOT_MARGIN_MODE,
    }),
    createCheck({
      detail: `gate ${executionGate.status ?? "watch"}`,
      id: "gate",
      label: "Gate armado",
      ok: executionGate.status === "armed",
    }),
    createCheck({
      detail: `plano ${executionPlan.state ?? "watch"}`,
      id: "trigger",
      label: "Plano no gatilho",
      ok: executionPlan.state === "trigger",
    }),
    createCheck({
      detail: `quality ${executionQuality.status ?? "watch"}; score ${qualityScore}`,
      id: "quality",
      label: "Qualidade minima",
      ok: qualityQualified,
    }),
    createCheck({
      blocking: false,
      detail: `${journalResolved}/5 planos fechados`,
      id: "journal",
      label: "Journal maduro",
      ok: journalReady,
    }),
  ];
  const criticalBlocked = checks.some((check) => check.blocking && !check.ok);
  let status = "blocked";

  if (!criticalBlocked && qualityPrime && journalReady) {
    status = "armed";
  } else if (!criticalBlocked) {
    status = "manual-only";
  }

  const tone = status === "armed" ? "bull" : status === "manual-only" ? "warn" : "danger";
  const label = status === "armed" ? "AUTO PAPER READY" : status === "manual-only" ? "MANUAL ONLY" : "AUTO BLOQUEADO";

  return {
    canAutoPaper: status === "armed",
    checks,
    guidance: guidanceForStatus(status),
    label,
    ready: status !== "blocked",
    status,
    tone,
  };
}
