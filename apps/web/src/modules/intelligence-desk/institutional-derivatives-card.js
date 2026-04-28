// ADR-120 — Onda 2 frontend: card institucional consumindo derivatives + CVD + orderbook.
//
// Filosofia:
// - Modulo isolado (anti God Object): main.js so chama mount + update + reset.
// - Reusa sharedCoalescer (Onda 1) para evitar disparos duplicados em cliques rapidos.
// - Reusa registry de reset (Onda 1) para limpar ao trocar ativo.
// - Degrada silenciosamente: se um endpoint falha (ex.: simbolo externo nao mapeado),
//   o card oculta a metrica afetada sem poluir o desk com erros.
// - Fail-honest: nunca renderiza placeholders enganosos; quando dado nao chegou,
//   mostra "—" explicito.

import { sharedCoalescer } from "../../shared/coalesce.js";

const FETCH_DEDUPE_TTL_MS = 200;

let rootElement = null;
let elements = null;
let currentAssetId = null;
let activeRequestToken = 0;
let lastSnapshotByAsset = new Map();

function createMarkup() {
  return `
    <header class="institutional-derivatives__header">
      <h3 class="institutional-derivatives__title">Fluxo institucional perp</h3>
      <span class="institutional-derivatives__subtitle">Funding · Open Interest · CVD · Orderbook L2</span>
    </header>
    <div class="institutional-derivatives__grid">
      <article class="institutional-derivatives__cell" data-cell="funding" aria-label="Funding rate dos perpetuos">
        <span class="institutional-derivatives__label">Funding (perp)</span>
        <span class="institutional-derivatives__value" data-field="funding-bps">—</span>
        <span class="institutional-derivatives__hint" data-field="funding-interpretation">aguardando</span>
        <div class="institutional-derivatives__sparkline" data-field="funding-sparkline" aria-hidden="true"></div>
        <span class="institutional-derivatives__hint" data-field="funding-trend">24h —</span>
      </article>
      <article class="institutional-derivatives__cell" data-cell="oi" aria-label="Open interest">
        <span class="institutional-derivatives__label">Open Interest</span>
        <span class="institutional-derivatives__value" data-field="open-interest">—</span>
        <span class="institutional-derivatives__hint" data-field="mark-price">mark —</span>
      </article>
      <article class="institutional-derivatives__cell" data-cell="cvd" aria-label="Cumulative Volume Delta">
        <span class="institutional-derivatives__label">CVD (janela)</span>
        <span class="institutional-derivatives__value" data-field="cvd">—</span>
        <span class="institutional-derivatives__hint" data-field="buy-ratio">buy/total —</span>
      </article>
      <article class="institutional-derivatives__cell" data-cell="orderbook" aria-label="Imbalance do orderbook L2">
        <span class="institutional-derivatives__label">Orderbook imbalance</span>
        <span class="institutional-derivatives__value" data-field="imbalance">—</span>
        <span class="institutional-derivatives__hint" data-field="spread">spread —</span>
      </article>
    </div>
    <footer class="institutional-derivatives__footer" data-field="footer">
      Selecione um ativo cripto para ativar.
    </footer>
  `;
}

function cacheElements() {
  if (!rootElement) return;
  elements = {
    fundingBps: rootElement.querySelector('[data-field="funding-bps"]'),
    fundingInterpretation: rootElement.querySelector('[data-field="funding-interpretation"]'),
    fundingSparkline: rootElement.querySelector('[data-field="funding-sparkline"]'),
    fundingTrend: rootElement.querySelector('[data-field="funding-trend"]'),
    openInterest: rootElement.querySelector('[data-field="open-interest"]'),
    markPrice: rootElement.querySelector('[data-field="mark-price"]'),
    cvd: rootElement.querySelector('[data-field="cvd"]'),
    buyRatio: rootElement.querySelector('[data-field="buy-ratio"]'),
    imbalance: rootElement.querySelector('[data-field="imbalance"]'),
    spread: rootElement.querySelector('[data-field="spread"]'),
    footer: rootElement.querySelector('[data-field="footer"]'),
    cells: {
      funding: rootElement.querySelector('[data-cell="funding"]'),
      oi: rootElement.querySelector('[data-cell="oi"]'),
      cvd: rootElement.querySelector('[data-cell="cvd"]'),
      orderbook: rootElement.querySelector('[data-cell="orderbook"]'),
    },
  };
}

function setText(el, value) {
  if (el instanceof HTMLElement) {
    el.textContent = value;
  }
}

function setCellTone(cellName, tone) {
  if (!elements || !elements.cells[cellName]) return;
  elements.cells[cellName].dataset.tone = tone;
}

function formatBps(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} bps`;
}

function formatNumberCompact(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
  return value.toFixed(2);
}

function formatPrice(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function fundingTone(interpretation) {
  switch (interpretation) {
    case "extreme_long":
    case "long_pressure":
      return "bear"; // longs sobreestendidos = bias bearish curto prazo
    case "extreme_short":
    case "short_pressure":
      return "bull"; // shorts em panico = combustivel para squeeze
    default:
      return "neutral";
  }
}

function imbalanceTone(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "neutral";
  if (value > 0.15) return "bull";
  if (value < -0.15) return "bear";
  return "neutral";
}

function cvdTone(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "neutral";
  if (value > 0) return "bull";
  if (value < 0) return "bear";
  return "neutral";
}

function clearRendered() {
  if (!elements) return;
  setText(elements.fundingBps, "—");
  setText(elements.fundingInterpretation, "aguardando");
  if (elements.fundingSparkline) elements.fundingSparkline.innerHTML = "";
  setText(elements.fundingTrend, "24h —");
  setText(elements.openInterest, "—");
  setText(elements.markPrice, "mark —");
  setText(elements.cvd, "—");
  setText(elements.buyRatio, "buy/total —");
  setText(elements.imbalance, "—");
  setText(elements.spread, "spread —");
  for (const cellName of ["funding", "oi", "cvd", "orderbook"]) {
    setCellTone(cellName, "neutral");
  }
}

async function fetchEndpoint(path) {
  // Coalesce por path: cliques rapidos no mesmo ativo nao bombardeiam o backend.
  const key = `derivatives-card:${path}`;
  return sharedCoalescer.run(key, async () => {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const body = await response.json();
    return body && typeof body === "object" && body.data ? body.data : body;
  });
}

function renderDerivatives(payload) {
  if (!elements || !payload || typeof payload !== "object") return;
  const fundingPressure = payload.fundingPressure ?? {};
  const derivatives = payload.contract?.derivatives ?? {};
  const rateBps = typeof fundingPressure.rateBps === "number" ? fundingPressure.rateBps : null;
  const interpretation = typeof fundingPressure.interpretation === "string"
    ? fundingPressure.interpretation
    : "neutral";

  setText(elements.fundingBps, formatBps(rateBps));
  setText(elements.fundingInterpretation, humanInterpretation(interpretation));
  setCellTone("funding", fundingTone(interpretation));

  setText(elements.openInterest, formatNumberCompact(derivatives.openInterest));
  setText(elements.markPrice, `mark ${formatPrice(derivatives.markPrice)}`);
  setCellTone("oi", "neutral");
}

function humanInterpretation(interpretation) {
  switch (interpretation) {
    case "extreme_long": return "longs sobreestendidos";
    case "long_pressure": return "pressao long";
    case "short_pressure": return "pressao short";
    case "extreme_short": return "shorts em panico";
    default: return "neutro";
  }
}

// ADR-125: helper puro para sparkline SVG inline (DOM-free, testavel).
// Recebe array de bps e retorna string SVG (ou string vazia se < 2 pontos).
export function renderFundingSparkline(bpsValues, options) {
  const opts = options ?? {};
  const width = typeof opts.width === "number" ? opts.width : 80;
  const height = typeof opts.height === "number" ? opts.height : 24;
  const stroke = typeof opts.stroke === "string" ? opts.stroke : "currentColor";

  if (!Array.isArray(bpsValues) || bpsValues.length < 2) {
    return "";
  }

  const finiteValues = bpsValues.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (finiteValues.length < 2) return "";

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const range = maxValue - minValue;
  const denom = range > 0 ? range : 1; // evita div/0 quando todos iguais
  const stepX = finiteValues.length > 1 ? width / (finiteValues.length - 1) : 0;

  const points = finiteValues.map((value, index) => {
    const x = index * stepX;
    // Inverte Y (SVG: 0 no topo). Achata em linha central se range=0.
    const normalized = range > 0 ? (value - minValue) / denom : 0.5;
    const y = height - normalized * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const path = `M${points[0]} L${points.slice(1).join(" L")}`;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="${height}" role="presentation"><path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function fundingTrendLabel(trend, latestBps, hours) {
  const hoursLabel = `${hours}h`;
  if (trend === "up") return `${hoursLabel} ↑ ${formatBps(latestBps)}`;
  if (trend === "down") return `${hoursLabel} ↓ ${formatBps(latestBps)}`;
  if (trend === "flat") return `${hoursLabel} → ${formatBps(latestBps)}`;
  return `${hoursLabel} —`;
}

function renderFundingHistory(payload) {
  if (!elements || !payload || typeof payload !== "object") return;
  const points = Array.isArray(payload.points) ? payload.points : [];
  const summary = payload.summary ?? {};
  const hours = typeof payload.hours === "number" ? payload.hours : 24;
  const bpsValues = points
    .map((p) => (typeof p?.fundingRateBps === "number" ? p.fundingRateBps : null))
    .filter((v) => v !== null);

  if (elements.fundingSparkline) {
    elements.fundingSparkline.innerHTML = renderFundingSparkline(bpsValues, { width: 80, height: 22 });
  }
  setText(
    elements.fundingTrend,
    fundingTrendLabel(summary.trend ?? "n/a", summary.latestRateBps ?? null, hours),
  );
}

function renderCvd(payload) {
  if (!elements || !payload || typeof payload !== "object") return;
  const cvd = typeof payload.cvd === "number" ? payload.cvd : null;
  const buyRatio = typeof payload.buyRatio === "number" ? payload.buyRatio : null;
  const windowTrades = typeof payload.windowTrades === "number" ? payload.windowTrades : 0;
  setText(elements.cvd, formatNumberCompact(cvd));
  setText(
    elements.buyRatio,
    buyRatio !== null
      ? `buy ${(buyRatio * 100).toFixed(1)}% · ${windowTrades} trades`
      : "buy/total —",
  );
  setCellTone("cvd", cvdTone(cvd));
}

function renderOrderbook(payload) {
  if (!elements || !payload || typeof payload !== "object") return;
  const totals = payload.totals ?? {};
  const spread = payload.spread ?? {};
  const imbalance = typeof totals.imbalance === "number" ? totals.imbalance : null;
  setText(
    elements.imbalance,
    imbalance !== null ? `${(imbalance * 100).toFixed(1)}%` : "—",
  );
  if (typeof spread.relativeBps === "number" && Number.isFinite(spread.relativeBps)) {
    setText(elements.spread, `spread ${spread.relativeBps.toFixed(2)} bps`);
  } else {
    setText(elements.spread, "spread —");
  }
  setCellTone("orderbook", imbalanceTone(imbalance));
}

function setFooter(message, tone) {
  if (!elements || !elements.footer) return;
  elements.footer.textContent = message;
  elements.footer.dataset.tone = tone ?? "neutral";
}

export function mountInstitutionalDerivativesCard(root) {
  if (!(root instanceof HTMLElement)) return;
  rootElement = root;
  rootElement.classList.add("institutional-derivatives");
  rootElement.innerHTML = createMarkup();
  cacheElements();
  clearRendered();
}

export function clearInstitutionalDerivativesCard() {
  currentAssetId = null;
  activeRequestToken += 1; // invalida fetches em voo
  if (!elements) return;
  clearRendered();
  setFooter("Selecione um ativo cripto para ativar.", "neutral");
}

export async function updateInstitutionalDerivativesCard(assetId) {
  if (!elements) return;
  if (typeof assetId !== "string" || assetId.trim().length === 0) {
    clearInstitutionalDerivativesCard();
    return;
  }
  const normalized = assetId.trim().toLowerCase();
  currentAssetId = normalized;
  const requestToken = ++activeRequestToken;
  setFooter(`Sincronizando ${normalized}…`, "neutral");

  const [derivativesResult, cvdResult, orderbookResult, fundingHistoryResult] = await Promise.allSettled([
    fetchEndpoint(`/v1/crypto/derivatives?assetId=${encodeURIComponent(normalized)}`),
    fetchEndpoint(`/v1/crypto/cvd?assetId=${encodeURIComponent(normalized)}&limit=500`),
    fetchEndpoint(`/v1/crypto/orderbook-depth?assetId=${encodeURIComponent(normalized)}&levels=20`),
    fetchEndpoint(`/v1/crypto/funding-history?assetId=${encodeURIComponent(normalized)}&hours=24`),
  ]);

  // Latest-wins: se um update mais recente ja foi disparado, descarta esta resposta.
  if (requestToken !== activeRequestToken || currentAssetId !== normalized) {
    return;
  }

  let okCount = 0;
  let unsupportedCount = 0;

  if (derivativesResult.status === "fulfilled") {
    renderDerivatives(derivativesResult.value);
    okCount += 1;
    lastSnapshotByAsset.set(`${normalized}:derivatives`, derivativesResult.value);
  } else if (derivativesResult.reason?.status === 400 || derivativesResult.reason?.status === 404) {
    unsupportedCount += 1;
  }

  if (cvdResult.status === "fulfilled") {
    renderCvd(cvdResult.value);
    okCount += 1;
    lastSnapshotByAsset.set(`${normalized}:cvd`, cvdResult.value);
  } else if (cvdResult.reason?.status === 400 || cvdResult.reason?.status === 404) {
    unsupportedCount += 1;
  }

  if (orderbookResult.status === "fulfilled") {
    renderOrderbook(orderbookResult.value);
    okCount += 1;
    lastSnapshotByAsset.set(`${normalized}:orderbook`, orderbookResult.value);
  } else if (orderbookResult.reason?.status === 400 || orderbookResult.reason?.status === 404) {
    unsupportedCount += 1;
  }

  // ADR-125: funding-history e auxiliar (nao entra no okCount/3 que mede feeds primarios).
  if (fundingHistoryResult.status === "fulfilled") {
    renderFundingHistory(fundingHistoryResult.value);
    lastSnapshotByAsset.set(`${normalized}:funding-history`, fundingHistoryResult.value);
  } else if (elements?.fundingSparkline) {
    elements.fundingSparkline.innerHTML = "";
    setText(elements.fundingTrend, "24h —");
  }

  if (okCount === 3) {
    setFooter(`${normalized} · feeds institucionais sincronizados`, "ok");
  } else if (okCount === 0 && unsupportedCount > 0) {
    // Simbolo externo (forex/indices/commodities) ou nao suportado: oculta sem alarmar.
    setFooter(`${normalized} sem perpetuos mapeados (feed institucional indisponivel).`, "neutral");
    clearRendered();
  } else if (okCount === 0) {
    setFooter("Feeds institucionais offline. Tentando degradar com cache stale.", "warn");
  } else {
    setFooter(`${okCount}/3 feeds institucionais entregues. Veja celulas com dados.`, "warn");
  }
}

// Exposto para testes: snapshot raw da ultima resposta por (asset, feed).
export function _peekLastSnapshot(assetId, feed) {
  return lastSnapshotByAsset.get(`${assetId}:${feed}`) ?? null;
}

// Reseta state interno (usado por testes).
export function _resetInternalState() {
  rootElement = null;
  elements = null;
  currentAssetId = null;
  activeRequestToken = 0;
  lastSnapshotByAsset = new Map();
}

// Pure helpers exportados para testes (DOM-free).
export const _testables = {
  formatBps,
  formatNumberCompact,
  formatPrice,
  fundingTone,
  imbalanceTone,
  cvdTone,
  humanInterpretation,
  fundingTrendLabel,
};
