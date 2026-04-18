/**
 * Paper Trading Dashboard (Wave 15 — ADR-055)
 *
 * Renderiza um card minimalista com stats agregadas vindas de
 * GET /v1/paper-trading/stats e a lista dos ultimos trades de
 * GET /v1/paper-trading/trades. Failure-open: erros nao quebram a app.
 */

const STATS_ENDPOINT = "/v1/paper-trading/stats";
const TRADES_ENDPOINT = "/v1/paper-trading/trades";
const REFRESH_INTERVAL_MS = 30_000;

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  if (!Number.isFinite(value)) {
    return "∞";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatNumber(value, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  if (!Number.isFinite(value)) {
    return "∞";
  }
  return value.toFixed(digits);
}

function formatTimestamp(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms)) {
    return "—";
  }
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

function statusBadge(status) {
  const map = {
    open: { label: "ABERTO", color: "#3b82f6" },
    win: { label: "WIN", color: "#10b981" },
    loss: { label: "LOSS", color: "#ef4444" },
    expired: { label: "EXPIRADO", color: "#9ca3af" },
  };
  const entry = map[status] ?? { label: status, color: "#9ca3af" };
  return `<span class="paper-trading__badge" style="background:${entry.color}">${entry.label}</span>`;
}

function renderStats(container, stats) {
  const winRateColor =
    stats.winRatePercent >= 60
      ? "#10b981"
      : stats.winRatePercent >= 40
        ? "#f59e0b"
        : "#ef4444";

  container.innerHTML = `
    <div class="paper-trading__grid">
      <div class="paper-trading__metric">
        <span class="paper-trading__metric-label">Trades</span>
        <span class="paper-trading__metric-value">${stats.totalTrades}</span>
        <span class="paper-trading__metric-sub">${stats.openTrades} abertos · ${stats.closedTrades} fechados</span>
      </div>
      <div class="paper-trading__metric">
        <span class="paper-trading__metric-label">Win Rate</span>
        <span class="paper-trading__metric-value" style="color:${winRateColor}">${formatNumber(stats.winRatePercent, 1)}%</span>
        <span class="paper-trading__metric-sub">${stats.wins}W / ${stats.losses}L</span>
      </div>
      <div class="paper-trading__metric">
        <span class="paper-trading__metric-label">Profit Factor</span>
        <span class="paper-trading__metric-value">${formatNumber(stats.profitFactor)}</span>
        <span class="paper-trading__metric-sub">avg win ${formatPercent(stats.avgWinPercent)} / avg loss ${formatPercent(stats.avgLossPercent)}</span>
      </div>
      <div class="paper-trading__metric">
        <span class="paper-trading__metric-label">PnL Total</span>
        <span class="paper-trading__metric-value" style="color:${stats.totalPnlPercent >= 0 ? "#10b981" : "#ef4444"}">${formatPercent(stats.totalPnlPercent)}</span>
        <span class="paper-trading__metric-sub">max DD ${formatPercent(-stats.maxDrawdownPercent)}</span>
      </div>
    </div>
  `;
}

function renderTrades(container, trades) {
  if (!Array.isArray(trades) || trades.length === 0) {
    container.innerHTML =
      '<p class="paper-trading__empty">Nenhum trade simulado ainda. Sinais com confluência ≥ 4 abrirão entradas automaticamente.</p>';
    return;
  }
  const recent = trades.slice(-10).reverse();
  const rows = recent
    .map(
      (trade) => `
        <tr>
          <td>${trade.asset}</td>
          <td>${trade.side === "long" ? "↑ LONG" : "↓ SHORT"}</td>
          <td>${formatNumber(trade.entryPrice, 4)}</td>
          <td>${formatNumber(trade.targetPrice, 4)}</td>
          <td>${formatNumber(trade.stopPrice, 4)}</td>
          <td>${statusBadge(trade.status)}</td>
          <td>${trade.pnlPercent === null ? "—" : formatPercent(trade.pnlPercent)}</td>
          <td>${formatTimestamp(trade.openedAtMs)}</td>
        </tr>
      `,
    )
    .join("");
  container.innerHTML = `
    <table class="paper-trading__table">
      <thead>
        <tr>
          <th>Ativo</th>
          <th>Direção</th>
          <th>Entrada</th>
          <th>Alvo</th>
          <th>Stop</th>
          <th>Status</th>
          <th>PnL</th>
          <th>Aberto em</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.json();
  return body?.data;
}

async function refresh(statsEl, tradesEl) {
  try {
    const [stats, trades] = await Promise.all([
      fetchJson(STATS_ENDPOINT),
      fetchJson(TRADES_ENDPOINT),
    ]);
    if (stats && statsEl) {
      renderStats(statsEl, stats);
    }
    if (trades && tradesEl) {
      renderTrades(tradesEl, trades);
    }
  } catch {
    /* failure-open: nao polui UI com erro de rede em painel secundario */
  }
}

export function initPaperTradingPanel() {
  const root = document.querySelector("#paper-trading-panel");
  if (!root) {
    return;
  }
  const statsEl = root.querySelector(".paper-trading__stats");
  const tradesEl = root.querySelector(".paper-trading__trades");
  if (!statsEl || !tradesEl) {
    return;
  }

  void refresh(statsEl, tradesEl);
  setInterval(() => {
    void refresh(statsEl, tradesEl);
  }, REFRESH_INTERVAL_MS);
}
