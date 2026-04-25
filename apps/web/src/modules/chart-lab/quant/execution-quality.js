const MIN_RESOLVED_JOURNAL_SAMPLE = 5;

function toFiniteNumber(value, fallback = Number.NaN) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}


function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function roundNumber(value, precision = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizePlanState(value) {
  const state = String(value ?? "watch").toLowerCase();
  if (["trigger", "waiting", "watch", "blocked", "incomplete"].includes(state)) {
    return state;
  }

  return "watch";
}

function normalizeGateStatus(value) {
  const status = String(value ?? "watch").toLowerCase();
  if (["armed", "watch", "blocked"].includes(status)) {
    return status;
  }

  return "watch";
}

function ratioFromChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return 0;
  }

  const passed = checks.filter((check) => check?.ok === true).length;
  return passed / checks.length;
}

function factorFromPlanState(state) {
  switch (state) {
    case "trigger": return 1;
    case "waiting": return 0.78;
    case "watch": return 0.46;
    default: return 0;
  }
}

function factorFromEntry(entry) {
  if (entry?.inside === true) {
    return 1;
  }

  const distance = toFiniteNumber(entry?.distancePercent, Number.NaN);
  if (!Number.isFinite(distance)) return 0;
  if (distance <= 0.35) return 0.86;
  if (distance <= 1) return 0.68;
  if (distance <= 3) return 0.42;
  return 0.18;
}

function factorFromRiskReward(riskReward) {
  if (!Number.isFinite(riskReward)) {
    return 0;
  }

  return clampNumber((riskReward - 1.2) / 1.3, 0, 1);
}

function factorFromRiskDiscipline(risk) {
  const suggestedRiskPercent = toFiniteNumber(risk?.suggestedRiskPercent, 0);
  const baseRiskPercent = Math.max(toFiniteNumber(risk?.baseRiskPercent, 1), 0.01);

  if (suggestedRiskPercent <= 0) {
    return 0;
  }

  if (suggestedRiskPercent <= baseRiskPercent) {
    return 1;
  }

  return clampNumber(baseRiskPercent / suggestedRiskPercent, 0.25, 0.85);
}

function buildContribution({ detail, factor, id, label, weight }) {
  const safeFactor = clampNumber(factor, 0, 1);
  return {
    detail,
    id,
    label,
    ok: safeFactor >= 0.66,
    score: roundNumber(safeFactor * weight, 1),
    weight,
  };
}

function resolveQualityStatus({ gateStatus, journalReady, planState, score }) {
  if (gateStatus === "blocked" || planState === "blocked" || planState === "incomplete" || score < 48) {
    return {
      grade: score >= 35 ? "D" : "F",
      label: "REJEITAR",
      status: "reject",
      tone: "danger",
    };
  }

  if (score >= 82 && journalReady) {
    return {
      grade: "A",
      label: "PRIME",
      status: "prime",
      tone: "bull",
    };
  }

  if (score >= 68) {
    return {
      grade: score >= 78 ? "B+" : "B",
      label: "QUALIFICADO",
      status: "qualified",
      tone: "bull",
    };
  }

  return {
    grade: "C",
    label: "OBSERVAR",
    status: "watch",
    tone: "warn",
  };
}

function guidanceForQuality(status, journalReady, planState) {
  if (status === "prime") {
    return "Plano prime: gate, geometria, risco e amostra recente sustentam execucao disciplinada.";
  }

  if (status === "qualified") {
    return journalReady
      ? "Plano qualificado: executar apenas se o gatilho operacional permanecer valido."
      : "Plano qualificado, mas journal ainda aquecendo; tamanho conservador ate amostra fechar.";
  }

  if (status === "watch") {
    return planState === "waiting"
      ? "Qualidade moderada: aguardar preco voltar a zona antes de qualquer clique."
      : "Qualidade em observacao: exigir nova confirmacao antes de aumentar exposicao.";
  }

  return "Plano rejeitado: preservar capital ate gate, geometria e risco voltarem ao padrao minimo.";
}

export function buildExecutionQualitySnapshot(input = {}) {
  const executionGate = input.executionGate ?? {};
  const executionPlan = input.executionPlan ?? {};
  const journalSummary = input.journalSummary ?? {};
  const gateStatus = normalizeGateStatus(executionGate.status);
  const planState = normalizePlanState(executionPlan.state);
  const gateScore = clampNumber(toFiniteNumber(executionGate.score, 0), 0, 100);
  const planCheckRatio = ratioFromChecks(executionPlan.checks);
  const planStateFactor = factorFromPlanState(planState);
  const entryFactor = factorFromEntry(executionPlan.entry);
  const riskReward = toFiniteNumber(executionPlan?.risk?.riskReward, Number.NaN);
  const riskRewardFactor = factorFromRiskReward(riskReward);
  const riskDisciplineFactor = factorFromRiskDiscipline(executionPlan.risk);
  const journalResolved = Math.max(0, Math.trunc(toFiniteNumber(journalSummary.resolved, 0)));
  const journalReady = journalResolved >= MIN_RESOLVED_JOURNAL_SAMPLE;
  const journalScore = clampNumber(toFiniteNumber(journalSummary.score, 0), 0, 100);
  const journalFactor = journalReady ? journalScore / 100 : 0.5;
  const contributions = [
    buildContribution({
      detail: `Gate ${gateStatus}; score ${roundNumber(gateScore, 1)}/100`,
      factor: gateScore / 100,
      id: "gate",
      label: "Gate institucional",
      weight: 28,
    }),
    buildContribution({
      detail: `Checks do plano ${roundNumber(planCheckRatio * 100, 0)}% OK`,
      factor: planCheckRatio,
      id: "plan-checks",
      label: "Plano consistente",
      weight: 16,
    }),
    buildContribution({
      detail: `Estado ${planState}; entrada ${executionPlan.entry?.inside === true ? "dentro" : "fora"} da zona`,
      factor: Math.min(planStateFactor, entryFactor),
      id: "timing",
      label: "Timing de entrada",
      weight: 16,
    }),
    buildContribution({
      detail: Number.isFinite(riskReward) ? `R:R ${roundNumber(riskReward, 2)}` : "R:R indisponivel",
      factor: riskRewardFactor,
      id: "risk-reward",
      label: "Assimetria",
      weight: 16,
    }),
    buildContribution({
      detail: `Risco sugerido ${roundNumber(toFiniteNumber(executionPlan?.risk?.suggestedRiskPercent, 0), 2)}%`,
      factor: riskDisciplineFactor,
      id: "risk-discipline",
      label: "Disciplina de risco",
      weight: 10,
    }),
    buildContribution({
      detail: journalReady ? `Journal ${roundNumber(journalScore, 1)}/100` : `${journalResolved}/${MIN_RESOLVED_JOURNAL_SAMPLE} planos fechados`,
      factor: journalFactor,
      id: "journal",
      label: "Evidencia recente",
      weight: 14,
    }),
  ];
  let score = contributions.reduce((acc, contribution) => acc + toFiniteNumber(contribution.score, 0), 0);

  if (gateStatus === "blocked" || planState === "blocked" || planState === "incomplete") {
    score = Math.min(score, 34);
  } else if (!journalReady) {
    score = Math.min(score, 78);
  } else if (planState === "watch") {
    score = Math.min(score, 62);
  } else if (planState === "waiting") {
    score = Math.min(score, 84);
  }

  const roundedScore = roundNumber(score, 1);
  const status = resolveQualityStatus({ gateStatus, journalReady, planState, score: roundedScore });

  return {
    contributions,
    grade: status.grade,
    guidance: guidanceForQuality(status.status, journalReady, planState),
    journalReady,
    label: status.label,
    ready: executionPlan.ready === true && gateStatus !== "blocked",
    sampleState: journalReady ? String(journalSummary.sampleState ?? "Moderado") : "Aquecendo",
    score: roundedScore,
    status: status.status,
    tone: status.tone,
  };
}
