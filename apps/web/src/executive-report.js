// =============================================================
// Relatório Executivo — Briefing Tático Institucional
// Drop-in module. Sem dependências externas. WebSocket-ready.
// Padrão peer-reviewed (ADR-068 derivado, ADR-069 a registrar).
// =============================================================

const STALE_THRESHOLD_MS = 60_000;
const MIN_AUDITED_TRADES = 5;

// --- helpers internos ----------------------------------------
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPct(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/d";
  return `${value.toFixed(digits)}%`;
}

function fmtPrice(value, digits = 5) {
  if (!Number.isFinite(value)) return "n/d";
  return value.toFixed(digits);
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  const next = String(value ?? "—");
  if (el.textContent !== next) el.textContent = next;
}

function shortHash(input) {
  // FNV-1a 32-bit — leve, sem crypto.subtle (síncrono).
  let h = 0x811c9dc5;
  for (const ch of String(input)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function toneFor(direction) {
  if (direction === "buy" || direction === "bull" || direction === "long") return "bull";
  if (direction === "sell" || direction === "bear" || direction === "short") return "bear";
  return "neutral";
}

// --- renderers de cada seção ---------------------------------

function renderOverview(data) {
  const signal = data?.signal ?? {};
  const ctx = data?.context ?? {};
  const trigger = data?.smc?.sweepRisk || data?.smc?.structure || data?.timing?.note || "estrutura em consolidação";
  const zone = ctx?.zone ? ` na zona ${ctx.zone}` : "";
  const conf = Number.isFinite(signal?.confidence) ? ` Confiança composta: ${signal.confidence.toFixed(0)}%.` : "";
  const text = `Cenário ${signal?.title ?? "indefinido"}${zone}. Gatilho dominante: ${trigger}.${conf}`;
  setText("report-overview-narrative", text);
}

function renderMtf(data) {
  const grid = $("report-mtf-grid");
  if (!grid) return;
  const mtf = Array.isArray(data?.multiTimeframe) ? data.multiTimeframe : [];
  const fallback = ["M15", "H1", "H4", "D1"].map((tf) => ({ timeframe: tf, direction: "neutral", note: "n/d" }));
  const rows = (mtf.length > 0 ? mtf : fallback).slice(0, 6);
  grid.innerHTML = rows
    .map((row) => {
      const tone = toneFor(String(row.direction ?? "").toLowerCase());
      const label = String(row.direction ?? "Neutro").toUpperCase();
      return `<div class="report-mtf-cell" data-tone="${tone}" role="row">
        <span>${escapeHtml(row.timeframe ?? "TF")}</span>
        <strong>${escapeHtml(label)}</strong>
      </div>`;
    })
    .join("");
}

function renderSmc(data) {
  const list = $("report-smc-list");
  if (!list) return;
  const smc = data?.smc ?? {};
  const items = [];
  if (smc.structure) items.push(`Estrutura: ${smc.structure}`);
  if (smc.liquidity) items.push(`Liquidez: ${smc.liquidity}`);
  if (smc.sweepRisk) items.push(`Sweep risk: ${smc.sweepRisk}`);
  if (Array.isArray(smc.orderBlocks)) {
    smc.orderBlocks.slice(0, 3).forEach((ob) => {
      items.push(`Order Block ${escapeHtml(ob?.kind ?? "")}: ${fmtPrice(ob?.low)} – ${fmtPrice(ob?.high)}`);
    });
  }
  if (items.length === 0) items.push("Nenhum nível institucional relevante mapeado no snapshot atual.");
  list.innerHTML = items.map((it) => `<li>${escapeHtml(it)}</li>`).join("");
}

function renderKinetic(data) {
  const row = $("report-kinetic-kpis");
  if (!row) return;
  const mt = data?.microTiming ?? {};
  const kpis = [
    { label: "Momentum", value: Number.isFinite(mt.momentumStrength) ? `${(mt.momentumStrength * 100).toFixed(0)}%` : "n/d" },
    { label: "Vol. Anômalo", value: mt.volumeAnomaly ? "DETECTADO" : "estável" },
    { label: "Tick Speed", value: mt.tickSpeed ?? "n/d" },
    { label: "Janela", value: mt.window ?? "—" },
  ];
  row.innerHTML = kpis
    .map((k) => `<div class="report-kpi"><span>${escapeHtml(k.label)}</span><strong>${escapeHtml(k.value)}</strong></div>`)
    .join("");
  setText("report-kinetic-note", mt.note ?? "Sem alerta cinético no momento.");
}

function renderHarmonic(data) {
  const row = $("report-harmonic-kpis");
  if (!row) return;
  const h = data?.harmonic ?? {};
  const kpis = [
    { label: "Padrão", value: h.pattern ?? "n/d" },
    { label: "Razão", value: Number.isFinite(h.ratio) ? h.ratio.toFixed(3) : "n/d" },
    { label: "Confiança", value: Number.isFinite(h.confidence) ? `${h.confidence.toFixed(1)}%` : "n/d" },
    { label: "PRZ", value: h.prz ?? "—" },
  ];
  row.innerHTML = kpis
    .map((k) => `<div class="report-kpi"><span>${escapeHtml(k.label)}</span><strong>${escapeHtml(k.value)}</strong></div>`)
    .join("");
  setText("report-harmonic-note", h.note ?? "Padrões harmônicos servem como confirmação convergente — não como gatilho isolado.");
}

function renderTechnical(data) {
  const list = $("report-technical-list");
  if (!list) return;
  const t = data?.technical ?? {};
  const items = [];
  if (Number.isFinite(t.rsi)) items.push(`RSI: ${t.rsi.toFixed(1)} (${t.rsi > 70 ? "sobrecomprado" : t.rsi < 30 ? "sobrevendido" : "neutro"})`);
  if (t.macd) items.push(`MACD: ${t.macd}`);
  if (t.movingAverages) items.push(`Médias: ${t.movingAverages}`);
  if (Number.isFinite(t.adx)) items.push(`ADX: ${t.adx.toFixed(1)} (${t.adx > 25 ? "tendência forte" : "lateral"})`);
  if (Number.isFinite(t.atr)) items.push(`ATR: ${t.atr.toFixed(4)} (volatilidade)`);
  if (items.length === 0) items.push("Indicadores técnicos sem confluência destacável — confirme com SMC e cinética.");
  list.innerHTML = items.map((it) => `<li>${escapeHtml(it)}</li>`).join("");
}

function renderGhost(data) {
  const valueEl = $("report-ghost-winrate");
  const sampleEl = $("report-ghost-sample");
  if (!valueEl || !sampleEl) return;
  const ghost = data?.ghostTracker ?? {};
  const resolved = Number(ghost.resolvedTrades ?? 0);
  if (resolved >= MIN_AUDITED_TRADES && Number.isFinite(ghost.winRate)) {
    valueEl.textContent = `${ghost.winRate.toFixed(1)}%`;
    valueEl.dataset.state = "ready";
    sampleEl.textContent = `Auditado em ${resolved} trades resolvidos (W:${ghost.wins ?? "?"} / L:${ghost.losses ?? "?"} / P:${ghost.pushes ?? 0}).`;
  } else {
    valueEl.textContent = "Aquecendo";
    valueEl.dataset.state = "warming";
    sampleEl.textContent = `${resolved}/${MIN_AUDITED_TRADES} trades resolvidos para ativar auditoria. Estatística honesta — não fabricamos win rate.`;
  }
}

function renderPlan(data) {
  const ol = $("report-plan-steps");
  if (!ol) return;
  const plan = Array.isArray(data?.plan) ? data.plan : null;
  const signal = data?.signal ?? {};
  const steps = plan?.length
    ? plan
    : [
        signal.entryLow ? `Aguardar toque no nível ${fmtPrice(signal.entryLow)}–${fmtPrice(signal.entryHigh)}.` : "Aguardar toque na zona-chave.",
        "Confirmar desaceleração / sweep de liquidez no fluxo cinético.",
        signal.stopLoss ? `Posicionar stop em ${fmtPrice(signal.stopLoss)} (invalidação estrutural).` : "Posicionar stop na invalidação estrutural.",
        signal.takeProfit1 ? `Parcial em ${fmtPrice(signal.takeProfit1)} (50–70% da posição).` : "Parcial em TP1 (50–70%).",
        "Trailing no restante até TP2/TP3 ou rompimento contrário.",
      ];
  ol.innerHTML = steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
}

function renderRisk(data) {
  const grid = $("report-risk-grid");
  if (!grid) return;
  const s = data?.signal ?? {};
  const rr = Number.isFinite(s.riskReward) ? `${s.riskReward.toFixed(2)}:1` : "n/d";
  const rrClass = Number.isFinite(s.riskReward) && s.riskReward < 1.5 ? "BAIXA" : "ADEQUADA";
  const kpis = [
    { label: "R:R", value: rr },
    { label: "Classificação", value: rrClass },
    { label: "Risco/Op.", value: "1% capital" },
    { label: "Exposição máx.", value: "3% simultâneo" },
  ];
  grid.innerHTML = kpis
    .map((k) => `<div class="report-kpi"><span>${escapeHtml(k.label)}</span><strong>${escapeHtml(k.value)}</strong></div>`)
    .join("");
}

function renderHeader(data) {
  setText("executive-report-asset", data?.asset ?? data?.symbol ?? "—");
  setText("executive-report-timeframe", data?.timeframe ?? "—");
  const ts = data?.snapshotAt ?? Date.now();
  const date = new Date(ts);
  const tsEl = $("executive-report-timestamp");
  if (tsEl) {
    tsEl.dateTime = date.toISOString();
    tsEl.textContent = date.toLocaleString("pt-BR");
  }
  const live = $("executive-report-live-badge");
  if (live) {
    const age = Date.now() - ts;
    if (age < STALE_THRESHOLD_MS) { live.dataset.state = "live"; live.textContent = "AO VIVO"; }
    else { live.dataset.state = "cached"; live.textContent = `CACHE ${Math.round(age / 60_000)}m`; }
  }
  setText("executive-report-id", shortHash(`${data?.asset}-${ts}-${data?.signal?.confidence ?? 0}`));
}

// --- API pública --------------------------------------------

/**
 * Injeta o snapshot vivo no relatório executivo.
 * Idempotente, leve, WebSocket-ready (chame a cada update).
 * @param {object} data - snapshot do motor analítico (mesma shape de `analysis`).
 */
export function generateExecutiveReport(data) {
  if (!data || typeof data !== "object") return;
  renderHeader(data);
  renderOverview(data);
  renderMtf(data);
  renderSmc(data);
  renderKinetic(data);
  renderHarmonic(data);
  renderTechnical(data);
  renderGhost(data);
  renderPlan(data);
  renderRisk(data);
}

/** Abre o modal e (opcionalmente) hidrata com snapshot. */
export function openExecutiveReport(snapshot) {
  const modal = $("executive-report-modal");
  if (!modal) return;
  if (snapshot) generateExecutiveReport(snapshot);
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "");
  // foco inicial no body para a11y
  modal.querySelector(".executive-report__body")?.focus({ preventScroll: true });
}

export function closeExecutiveReport() {
  const modal = $("executive-report-modal");
  if (!modal) return;
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
}

// --- Clipboard / Print --------------------------------------

function buildPlainText() {
  const sections = Array.from(document.querySelectorAll("#executive-report-modal .report-section"));
  const header = `=== BRIEFING TÁTICO INSTITUCIONAL ===\n${$("executive-report-asset")?.textContent ?? ""} • ${$("executive-report-timeframe")?.textContent ?? ""} • ${$("executive-report-timestamp")?.textContent ?? ""}\nReport ID: ${$("executive-report-id")?.textContent ?? ""}\n`;
  const body = sections
    .map((sec) => {
      const title = sec.querySelector("h3")?.textContent?.trim() ?? "";
      const content = (sec.innerText ?? "").replace(title, "").trim();
      return `\n--- ${title} ---\n${content}`;
    })
    .join("\n");
  const footer = "\n\n— Análise técnica educacional. Não é recomendação de investimento (CVM 88/22).";
  return header + body + footer;
}

async function copyReport(button) {
  const text = buildPlainText();
  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    } else {
      // Fallback execCommand para contextos não-HTTPS
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    }
  } catch { ok = false; }
  if (!button) return;
  const label = button.querySelector('[data-role="label"]') ?? button;
  const original = label.textContent;
  button.dataset.feedback = ok ? "ok" : "fail";
  label.textContent = ok ? "Copiado ✓" : "Falhou ✗";
  setTimeout(() => {
    button.removeAttribute("data-feedback");
    if (label.textContent !== original) label.textContent = original ?? "Copiar Relatório";
  }, 2000);
}

function printReport() {
  // CSS @media print já isola o modal; basta garantir que está aberto.
  const modal = $("executive-report-modal");
  if (modal && !modal.hasAttribute("open")) openExecutiveReport();
  window.print();
}

// --- Bootstrap (idempotente) --------------------------------

let bootstrapped = false;

export function bootstrapExecutiveReport({ openTrigger } = {}) {
  if (bootstrapped) return;
  bootstrapped = true;

  const modal = $("executive-report-modal");
  if (!modal) return;

  $("executive-report-close")?.addEventListener("click", () => closeExecutiveReport());
  $("executive-report-copy")?.addEventListener("click", (e) => copyReport(e.currentTarget));
  $("executive-report-copy-bottom")?.addEventListener("click", (e) => copyReport(e.currentTarget));
  $("executive-report-print")?.addEventListener("click", printReport);
  $("executive-report-print-bottom")?.addEventListener("click", printReport);

  // Web Share API opcional (mobile)
  if (navigator.share) {
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "executive-report__btn executive-report__btn--small";
    shareBtn.textContent = "Compartilhar";
    shareBtn.addEventListener("click", async () => {
      try { await navigator.share({ title: "Briefing Tático", text: buildPlainText() }); } catch { /* user cancel */ }
    });
    document.querySelector(".executive-report__footer")?.appendChild(shareBtn);
  }

  // ESC → fecha (dialog nativo já faz, garantimos foco de retorno)
  let lastTrigger = null;
  modal.addEventListener("close", () => { lastTrigger?.focus?.(); });
  if (openTrigger instanceof HTMLElement) {
    openTrigger.addEventListener("click", () => {
      lastTrigger = openTrigger;
      openExecutiveReport();
    });
  }
}
