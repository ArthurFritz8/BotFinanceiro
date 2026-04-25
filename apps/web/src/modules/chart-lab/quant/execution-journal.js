const DEFAULT_ENTRY_LIMIT = 80;
const DEFAULT_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const FINAL_STATUSES = new Set(["target2", "stopped", "invalid", "blocked"]);

function toFiniteNumber(value, fallback = Number.NaN) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function roundNumber(value, precision = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeSide(value) {
  const side = String(value ?? "neutral").toLowerCase();
  if (side === "buy" || side === "bull" || side === "call") return "buy";
  if (side === "sell" || side === "bear" || side === "put") return "sell";
  return "neutral";
}

function normalizeStatus(value) {
  const status = String(value ?? "tracking").toLowerCase();
  if (["tracking", "entered", "partial", "target2", "stopped", "watch", "blocked", "invalid"].includes(status)) {
    return status;
  }

  return "tracking";
}

function normalizeEntryBand(entry) {
  const low = toFiniteNumber(entry?.low, Number.NaN);
  const high = toFiniteNumber(entry?.high, Number.NaN);
  const midpoint = toFiniteNumber(entry?.midpoint, (low + high) / 2);

  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(midpoint)) {
    return null;
  }

  return {
    high: roundNumber(Math.max(low, high), 8),
    low: roundNumber(Math.min(low, high), 8),
    midpoint: roundNumber(midpoint, 8),
  };
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets
    .map((target, index) => {
      const price = toFiniteNumber(target?.price, Number.NaN);
      if (!Number.isFinite(price)) {
        return null;
      }

      return {
        id: typeof target?.id === "string" && target.id.length > 0 ? target.id : `tp${index + 1}`,
        label: typeof target?.label === "string" && target.label.length > 0 ? target.label : `Alvo ${index + 1}`,
        price: roundNumber(price, 8),
        riskReward: roundNumber(toFiniteNumber(target?.riskReward, Number.NaN), 2),
      };
    })
    .filter(Boolean)
    .slice(0, 2);
}

function resolveInitialStatus(planState, gateStatus, ready, entryInside) {
  if (!ready) return "invalid";
  if (gateStatus === "blocked" || planState === "blocked") return "blocked";
  if (planState === "watch") return "watch";
  return entryInside ? "entered" : "tracking";
}

function buildEntryFingerprint(entry) {
  return [
    entry.assetId,
    entry.side,
    entry.entry?.low,
    entry.entry?.high,
    entry.invalidation?.price,
    entry.targets?.[1]?.price ?? entry.targets?.[0]?.price,
  ].join(":");
}

function computeRiskUnit(entry) {
  const midpoint = toFiniteNumber(entry?.entry?.midpoint, Number.NaN);
  const stop = toFiniteNumber(entry?.invalidation?.price, Number.NaN);

  if (!Number.isFinite(midpoint) || !Number.isFinite(stop)) {
    return Number.NaN;
  }

  return entry.side === "sell" ? stop - midpoint : midpoint - stop;
}

function computeMoveR(entry, currentPrice) {
  const midpoint = toFiniteNumber(entry?.entry?.midpoint, Number.NaN);
  const riskUnit = computeRiskUnit(entry);

  if (!Number.isFinite(midpoint) || !Number.isFinite(riskUnit) || riskUnit <= 0 || !Number.isFinite(currentPrice)) {
    return null;
  }

  const move = entry.side === "sell" ? midpoint - currentPrice : currentPrice - midpoint;
  return roundNumber(move / riskUnit, 2);
}

function priceHitsEntry(entry, currentPrice) {
  const low = toFiniteNumber(entry?.entry?.low, Number.NaN);
  const high = toFiniteNumber(entry?.entry?.high, Number.NaN);
  return Number.isFinite(currentPrice) && Number.isFinite(low) && Number.isFinite(high) && currentPrice >= low && currentPrice <= high;
}

function priceHitsStop(entry, currentPrice) {
  const stop = toFiniteNumber(entry?.invalidation?.price, Number.NaN);
  if (!Number.isFinite(currentPrice) || !Number.isFinite(stop)) return false;
  return entry.side === "sell" ? currentPrice >= stop : currentPrice <= stop;
}

function priceHitsTarget(entry, targetIndex, currentPrice) {
  const target = toFiniteNumber(entry?.targets?.[targetIndex]?.price, Number.NaN);
  if (!Number.isFinite(currentPrice) || !Number.isFinite(target)) return false;
  return entry.side === "sell" ? currentPrice <= target : currentPrice >= target;
}

function isOpenStatus(status) {
  return status === "tracking" || status === "entered" || status === "partial" || status === "watch";
}

export function createExecutionJournalState(nowMs = Date.now()) {
  return {
    entries: [],
    lastRegisteredAtMs: 0,
    startedAtMs: nowMs,
    updatedAtMs: nowMs,
    version: 1,
  };
}

export function sanitizeExecutionJournalState(candidate, nowMs = Date.now()) {
  const base = createExecutionJournalState(nowMs);

  if (!candidate || typeof candidate !== "object") {
    return base;
  }

  const entries = Array.isArray(candidate.entries)
    ? candidate.entries
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          ...entry,
          fingerprint: typeof entry.fingerprint === "string" ? entry.fingerprint : buildEntryFingerprint(entry),
          status: normalizeStatus(entry.status),
        }))
        .slice(0, DEFAULT_ENTRY_LIMIT)
    : [];

  return {
    ...base,
    entries,
    lastRegisteredAtMs: toFiniteNumber(candidate.lastRegisteredAtMs, 0),
    startedAtMs: toFiniteNumber(candidate.startedAtMs, nowMs),
    updatedAtMs: toFiniteNumber(candidate.updatedAtMs, nowMs),
    version: 1,
  };
}

export function createExecutionJournalEntry(input = {}) {
  const snapshot = input.snapshot ?? {};
  const executionPlan = input.executionPlan ?? {};
  const executionGate = input.executionGate ?? {};
  const nowMs = toFiniteNumber(input.nowMs, Date.now());
  const entry = normalizeEntryBand(executionPlan.entry);
  const targets = normalizeTargets(executionPlan.targets);
  const side = normalizeSide(executionPlan.side);
  const ready = executionPlan.ready === true && entry !== null && targets.length > 0 && side !== "neutral";
  const invalidationPrice = toFiniteNumber(executionPlan?.invalidation?.price, Number.NaN);
  const currentPrice = toFiniteNumber(input.currentPrice, Number.NaN);
  const planState = typeof executionPlan.state === "string" ? executionPlan.state : "watch";
  const gateStatus = typeof executionGate.status === "string" ? executionGate.status : "watch";
  const status = resolveInitialStatus(planState, gateStatus, ready, executionPlan?.entry?.inside === true);
  const assetId = typeof snapshot.assetId === "string" && snapshot.assetId.length > 0 ? snapshot.assetId : "unknown";
  const entryId = `${assetId}:${nowMs}:${Math.random().toString(36).slice(2, 8)}`;
  const candidate = {
    assetId,
    currency: typeof snapshot.currency === "string" ? snapshot.currency : "usd",
    currentPrice: roundNumber(currentPrice, 8),
    entry,
    fingerprint: "",
    gate: {
      score: roundNumber(toFiniteNumber(executionGate.score, Number.NaN), 1),
      status: gateStatus,
    },
    id: entryId,
    invalidation: {
      price: roundNumber(invalidationPrice, 8),
    },
    maxAdverseR: 0,
    maxFavorableR: 0,
    mode: typeof snapshot.mode === "string" ? snapshot.mode : "unknown",
    openedAtMs: nowMs,
    outcomeR: null,
    planState,
    range: typeof snapshot.range === "string" ? snapshot.range : "",
    ready,
    resolution: typeof snapshot.resolution === "string" ? snapshot.resolution : "",
    risk: {
      riskReward: roundNumber(toFiniteNumber(executionPlan?.risk?.riskReward, Number.NaN), 2),
      suggestedRiskPercent: roundNumber(toFiniteNumber(executionPlan?.risk?.suggestedRiskPercent, 0), 2),
    },
    side,
    source: input.source === "auto" ? "auto" : "manual",
    status,
    symbol: typeof snapshot.symbol === "string" ? snapshot.symbol : assetId,
    targets,
    updatedAtMs: nowMs,
  };

  candidate.fingerprint = buildEntryFingerprint(candidate);
  return candidate;
}

export function appendExecutionJournalEntry(state, entry, options = {}) {
  const safeState = sanitizeExecutionJournalState(state);
  const nowMs = toFiniteNumber(options.nowMs, Date.now());

  if (!entry || typeof entry !== "object") {
    return { appended: false, reason: "invalid-entry", state: safeState };
  }

  if (entry.ready !== true || entry.status === "invalid") {
    return { appended: false, reason: "not-ready", state: safeState };
  }

  const duplicateWindowMs = toFiniteNumber(options.duplicateWindowMs, DEFAULT_DUPLICATE_WINDOW_MS);
  const preventDuplicate = options.preventDuplicate !== false;

  if (preventDuplicate) {
    const duplicate = safeState.entries.some((candidate) =>
      candidate.fingerprint === entry.fingerprint
      && isOpenStatus(candidate.status)
      && nowMs - toFiniteNumber(candidate.openedAtMs, 0) <= duplicateWindowMs,
    );

    if (duplicate) {
      return { appended: false, reason: "duplicate", state: safeState };
    }
  }

  const limit = Math.max(1, Math.trunc(toFiniteNumber(options.limit, DEFAULT_ENTRY_LIMIT)));
  return {
    appended: true,
    reason: "appended",
    state: {
      ...safeState,
      entries: [entry, ...safeState.entries].slice(0, limit),
      lastRegisteredAtMs: nowMs,
      updatedAtMs: nowMs,
    },
  };
}

export function settleExecutionJournalEntry(entry, currentPrice, nowMs = Date.now()) {
  const status = normalizeStatus(entry?.status);
  const safeEntry = { ...entry, status };

  if (FINAL_STATUSES.has(status) || safeEntry.ready !== true || !Number.isFinite(currentPrice)) {
    return { changed: false, entry: safeEntry };
  }

  const moveR = computeMoveR(safeEntry, currentPrice);
  let nextEntry = {
    ...safeEntry,
    currentPrice: roundNumber(currentPrice, 8),
    maxAdverseR: roundNumber(Math.min(toFiniteNumber(safeEntry.maxAdverseR, 0), moveR ?? 0), 2),
    maxFavorableR: roundNumber(Math.max(toFiniteNumber(safeEntry.maxFavorableR, 0), moveR ?? 0), 2),
    updatedAtMs: nowMs,
  };

  if (status === "watch") {
    return { changed: true, entry: nextEntry };
  }

  if (status === "tracking" && priceHitsEntry(nextEntry, currentPrice)) {
    nextEntry = {
      ...nextEntry,
      entryHitAtMs: nowMs,
      status: "entered",
    };
  }

  if (nextEntry.status === "tracking") {
    return { changed: true, entry: nextEntry };
  }

  if (priceHitsStop(nextEntry, currentPrice)) {
    const partialRiskReward = toFiniteNumber(nextEntry.targets?.[0]?.riskReward, 0);
    const outcomeR = nextEntry.status === "partial" ? roundNumber(Math.max(-1, partialRiskReward * 0.5 - 0.5), 2) : -1;
    return {
      changed: true,
      entry: {
        ...nextEntry,
        outcomeR,
        settledAtMs: nowMs,
        status: "stopped",
      },
    };
  }

  if (priceHitsTarget(nextEntry, 1, currentPrice)) {
    return {
      changed: true,
      entry: {
        ...nextEntry,
        outcomeR: roundNumber(toFiniteNumber(nextEntry.targets?.[1]?.riskReward, moveR ?? 0), 2),
        settledAtMs: nowMs,
        status: "target2",
      },
    };
  }

  if (nextEntry.status === "entered" && priceHitsTarget(nextEntry, 0, currentPrice)) {
    return {
      changed: true,
      entry: {
        ...nextEntry,
        partialHitAtMs: nowMs,
        status: "partial",
      },
    };
  }

  return { changed: true, entry: nextEntry };
}

export function settleExecutionJournalEntries(state, currentPrice, nowMs = Date.now()) {
  const safeState = sanitizeExecutionJournalState(state, nowMs);
  let changed = false;
  const entries = safeState.entries.map((entry) => {
    const result = settleExecutionJournalEntry(entry, currentPrice, nowMs);
    changed = changed || result.changed;
    return result.entry;
  });

  if (!changed) {
    return { changed: false, state: safeState };
  }

  return {
    changed: true,
    state: {
      ...safeState,
      entries,
      updatedAtMs: nowMs,
    },
  };
}

export function summarizeExecutionJournal(state) {
  const safeState = sanitizeExecutionJournalState(state);
  const resolvedEntries = safeState.entries.filter((entry) => entry.status === "target2" || entry.status === "stopped");
  const wins = resolvedEntries.filter((entry) => toFiniteNumber(entry.outcomeR, 0) > 0).length;
  const losses = resolvedEntries.filter((entry) => toFiniteNumber(entry.outcomeR, 0) < 0).length;
  const resolved = wins + losses;
  const open = safeState.entries.filter((entry) => isOpenStatus(entry.status)).length;
  const averageR = resolved > 0
    ? roundNumber(resolvedEntries.reduce((acc, entry) => acc + toFiniteNumber(entry.outcomeR, 0), 0) / resolved, 2)
    : 0;
  const winRate = resolved > 0 ? roundNumber((wins / resolved) * 100, 1) : 0;
  const score = resolved >= 5
    ? roundNumber(clampNumber(50 + (winRate - 50) * 0.55 + averageR * 18, 0, 100), 1)
    : 0;
  const tone = resolved < 5 ? "neutral" : score >= 68 ? "bull" : score >= 48 ? "warn" : "danger";

  return {
    averageR,
    guidance: resolved < 5
      ? `${resolved}/5 planos fechados para ativar score institucional.`
      : score >= 68
        ? "Journal confirma edge positivo recente; manter disciplina no gate."
        : score >= 48
          ? "Edge moderado: reduzir tamanho ate nova amostra melhorar."
          : "Edge fraco: preservar capital e revisar setups recentes.",
    losses,
    open,
    resolved,
    sampleState: resolved < 5 ? "Aquecendo" : resolved >= 20 ? "Robusto" : "Moderado",
    score,
    tone,
    total: safeState.entries.length,
    winRate,
    wins,
  };
}

export function getRecentExecutionJournalEntries(state, limit = 5) {
  const safeState = sanitizeExecutionJournalState(state);
  return safeState.entries.slice(0, Math.max(0, Math.trunc(limit)));
}
