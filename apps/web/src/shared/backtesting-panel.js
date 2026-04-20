/**
 * Backtesting UI Panel (Wave 18 — ADR-058)
 *
 * Form simples (asset + broker + range + strategy + comissao/slippage)
 * que dispara POST /v1/backtesting/run-asset e renderiza stats +
 * equity curve. Failure-open (erros sao exibidos in-place).
 */

const RUN_ASSET_ENDPOINT = "/v1/backtesting/run-asset";
const COMPARE_ASSET_ENDPOINT = "/v1/backtesting/compare-asset";
const HISTORY_ENDPOINT = "/v1/backtesting/history";
const LEADERBOARD_ENDPOINT = "/v1/backtesting/leaderboard";
const REGIME_ALERTS_ENDPOINT = "/v1/backtesting/regime-alerts";

const STRATEGIES = [
  { id: "ema_crossover", label: "EMA Crossover (trend-following)" },
  { id: "rsi_mean_reversion", label: "RSI Mean Reversion (counter-trend)" },
  { id: "smc_confluence", label: "SMC Confluence (BOS + swing stop)" },
];

const BROKERS = ["bybit", "coinbase", "kraken", "okx"];
const RANGES = ["24h", "7d", "30d", "90d", "1y"];

function fmtPct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return "∞";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function fmtNum(value, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return "∞";
  return value.toFixed(digits);
}

function fmtDate(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "—";
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return "—";
  }
}

function fmtDateTime(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

function buildForm() {
  return `
    <form class="backtesting__form" id="backtesting-form">
      <div class="backtesting__row">
        <label>Ativo
          <input type="text" name="asset" value="bitcoin" required maxlength="40" />
        </label>
        <label>Broker
          <select name="broker">
            ${BROKERS.map((b) => `<option value="${b}">${b}</option>`).join("")}
          </select>
        </label>
        <label>Periodo
          <select name="range">
            ${RANGES.map((r) => `<option value="${r}" ${r === "30d" ? "selected" : ""}>${r}</option>`).join("")}
          </select>
        </label>
        <label>Estrategia
          <select name="strategy">
            ${STRATEGIES.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="backtesting__row">
        <label class="backtesting__compare-toggle">
          <input type="checkbox" name="compareMode" />
          Modo comparacao (rodar todas as estrategias e comparar)
        </label>
      </div>
      <div class="backtesting__row">
        <label>Comissao % (por lado)
          <input type="number" name="commissionPercent" value="0" step="0.01" min="0" max="5" />
        </label>
        <label>Slippage %
          <input type="number" name="slippagePercent" value="0" step="0.01" min="0" max="5" />
        </label>
        <label>Cooldown (candles)
          <input type="number" name="cooldownCandles" value="1" step="1" min="0" max="500" />
        </label>
        <button type="submit" class="backtesting__submit">Rodar Backtest</button>
      </div>
    </form>
  `;
}

function renderEmpty() {
  return `<div class="backtesting__empty">Configure os parametros acima e clique em <strong>Rodar Backtest</strong>.</div>`;
}

function renderError(msg) {
  return `<div class="backtesting__error">Falha ao executar backtest: ${msg}</div>`;
}

function renderLoading() {
  return `<div class="backtesting__loading">Buscando candles e simulando…</div>`;
}

function renderResult(result) {
  const s = result.stats;
  const winColor =
    s.winRatePercent >= 60 ? "#10b981" : s.winRatePercent >= 40 ? "#f59e0b" : "#ef4444";
  const pnlColor = s.totalPnlPercent >= 0 ? "#10b981" : "#ef4444";

  const tradesRows = result.trades
    .slice(-15)
    .reverse()
    .map(
      (t) => `
      <tr>
        <td>${fmtDate(t.entryTMs)}</td>
        <td>${t.side.toUpperCase()}</td>
        <td>${fmtNum(t.entryPrice, 4)}</td>
        <td>${fmtNum(t.exitPrice, 4)}</td>
        <td style="color:${t.outcome === "win" ? "#10b981" : "#ef4444"}">${t.outcome.toUpperCase()}</td>
        <td>${fmtPct(t.pnlPercent)}</td>
      </tr>`,
    )
    .join("");

  return `
    <div class="backtesting__result">
      <div class="backtesting__header">
        <strong>${result.asset}</strong> · ${result.strategy} · ${result.candleCount} candles
        <span>${fmtDate(result.firstTMs)} → ${fmtDate(result.lastTMs)}</span>
      </div>
      <div class="backtesting__stats-grid">
        <div class="backtesting__stat">
          <span>Trades</span><strong>${s.totalTrades}</strong>
        </div>
        <div class="backtesting__stat">
          <span>Win Rate</span><strong style="color:${winColor}">${fmtNum(s.winRatePercent, 1)}%</strong>
        </div>
        <div class="backtesting__stat">
          <span>Profit Factor</span><strong>${fmtNum(s.profitFactor, 2)}</strong>
        </div>
        <div class="backtesting__stat">
          <span>Total PnL</span><strong style="color:${pnlColor}">${fmtPct(s.totalPnlPercent)}</strong>
        </div>
        <div class="backtesting__stat">
          <span>Avg Win</span><strong>${fmtPct(s.avgWinPercent)}</strong>
        </div>
        <div class="backtesting__stat">
          <span>Avg Loss</span><strong>${fmtPct(s.avgLossPercent)}</strong>
        </div>
        <div class="backtesting__stat">
          <span>Max Drawdown</span><strong style="color:#ef4444">${fmtPct(-s.maxDrawdownPercent)}</strong>
        </div>
      </div>
      <h4 class="backtesting__section-title">Ultimos trades</h4>
      ${
        tradesRows
          ? `<table class="backtesting__table"><thead><tr>
              <th>Data</th><th>Lado</th><th>Entry</th><th>Exit</th><th>Resultado</th><th>PnL</th>
            </tr></thead><tbody>${tradesRows}</tbody></table>`
          : `<div class="backtesting__empty">Nenhum trade executado neste periodo.</div>`
      }
    </div>
  `;
}

async function executeRun(payload, resultElement) {
  resultElement.innerHTML = renderLoading();
  try {
    const response = await fetch(RUN_ASSET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    if (!json?.data) {
      throw new Error("Resposta sem campo data");
    }
    resultElement.innerHTML = renderResult(json.data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    resultElement.innerHTML = renderError(msg);
  }
}

function renderCompare(payload) {
  const winners = {
    pnl: { strategy: null, value: -Infinity },
    winrate: { strategy: null, value: -Infinity },
    profitFactor: { strategy: null, value: -Infinity },
    drawdown: { strategy: null, value: Infinity },
  };
  for (const r of payload.results) {
    if (r.stats.totalPnlPercent > winners.pnl.value) {
      winners.pnl = { strategy: r.strategy, value: r.stats.totalPnlPercent };
    }
    if (r.stats.winRatePercent > winners.winrate.value) {
      winners.winrate = { strategy: r.strategy, value: r.stats.winRatePercent };
    }
    if (Number.isFinite(r.stats.profitFactor) && r.stats.profitFactor > winners.profitFactor.value) {
      winners.profitFactor = { strategy: r.strategy, value: r.stats.profitFactor };
    }
    if (r.stats.maxDrawdownPercent < winners.drawdown.value) {
      winners.drawdown = { strategy: r.strategy, value: r.stats.maxDrawdownPercent };
    }
  }

  const cell = (strategy, value, kind, formatted) => {
    const isWinner = winners[kind].strategy === strategy;
    const cls = isWinner ? "backtesting__cell--winner" : "";
    return `<td class="${cls}">${formatted}</td>`;
  };

  const rows = payload.results
    .map((r) => {
      const s = r.stats;
      return `<tr>
        <td><strong>${r.strategy}</strong></td>
        <td>${s.totalTrades}</td>
        ${cell(r.strategy, s.winRatePercent, "winrate", `${fmtNum(s.winRatePercent, 1)}%`)}
        ${cell(r.strategy, s.profitFactor, "profitFactor", fmtNum(s.profitFactor, 2))}
        ${cell(r.strategy, s.totalPnlPercent, "pnl", fmtPct(s.totalPnlPercent))}
        ${cell(r.strategy, -s.maxDrawdownPercent, "drawdown", fmtPct(-s.maxDrawdownPercent))}
      </tr>`;
    })
    .join("");

  return `
    <div class="backtesting__result">
      <div class="backtesting__header">
        <strong>${payload.asset}</strong> · ${payload.broker} · ${payload.range} · ${payload.candleCount} candles
        <span>${fmtDate(payload.firstTMs)} → ${fmtDate(payload.lastTMs)}</span>
      </div>
      <h4 class="backtesting__section-title">Comparacao de estrategias (vencedor por metrica destacado)</h4>
      <table class="backtesting__table backtesting__table--compare">
        <thead><tr>
          <th>Estrategia</th><th>Trades</th><th>Win Rate</th><th>Profit Factor</th><th>PnL Total</th><th>Max DD</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function executeCompare(payload, resultElement) {
  resultElement.innerHTML = renderLoading();
  try {
    const response = await fetch(COMPARE_ASSET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    if (!json?.data) {
      throw new Error("Resposta sem campo data");
    }
    resultElement.innerHTML = renderCompare(json.data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    resultElement.innerHTML = renderError(msg);
  }
}

function renderHistory(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="backtesting__empty">Nenhuma rodada comparativa registrada ainda. Ative o modo comparacao e rode um backtest.</div>`;
  }
  const rows = items
    .slice(0, 20)
    .map((entry) => {
      const summary = entry.results
        .map((r) => `${r.strategy}: ${fmtPct(r.totalPnlPercent)}`)
        .join(" · ");
      return `<tr>
        <td>${fmtDateTime(entry.ranAtMs)}</td>
        <td><strong>${entry.asset}</strong></td>
        <td>${entry.broker}</td>
        <td>${entry.range}</td>
        <td>${entry.candleCount}</td>
        <td>${summary}</td>
      </tr>`;
    })
    .join("");
  return `<table class="backtesting__table"><thead><tr>
      <th>Quando</th><th>Ativo</th><th>Broker</th><th>Range</th><th>Candles</th><th>PnL por estrategia</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLeaderboard(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="backtesting__empty">Leaderboard vazio. Rode comparacoes para alimentar.</div>`;
  }
  const rows = items
    .slice(0, 30)
    .map((entry, index) => {
      const pnlColor = entry.avgPnlPercent >= 0 ? "#10b981" : "#ef4444";
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${entry.asset}</strong></td>
        <td>${entry.strategy}</td>
        <td>${entry.roundsCount}</td>
        <td style="color:${pnlColor}"><strong>${fmtPct(entry.avgPnlPercent)}</strong></td>
        <td>${fmtNum(entry.avgWinRatePercent, 1)}%</td>
        <td>${fmtNum(entry.avgProfitFactor, 2)}</td>
        <td>${fmtPct(entry.bestPnlPercent)}</td>
        <td>${fmtPct(entry.worstPnlPercent)}</td>
        <td>${fmtDate(entry.lastRanAtMs)}</td>
      </tr>`;
    })
    .join("");
  return `<table class="backtesting__table"><thead><tr>
      <th>#</th><th>Ativo</th><th>Estrategia</th><th>Rodadas</th><th>PnL Medio</th><th>WinRate Medio</th><th>PF Medio</th><th>Melhor</th><th>Pior</th><th>Ultima</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

async function refreshHistoryAndLeaderboard(historyEl, leaderboardEl, alertsEl) {
  historyEl.innerHTML = renderLoading();
  leaderboardEl.innerHTML = renderLoading();
  if (alertsEl instanceof HTMLElement) alertsEl.innerHTML = renderLoading();
  try {
    const [hRes, lRes, aRes] = await Promise.all([
      fetch(`${HISTORY_ENDPOINT}?limit=20`),
      fetch(LEADERBOARD_ENDPOINT),
      fetch(REGIME_ALERTS_ENDPOINT),
    ]);
    if (!hRes.ok) throw new Error(`history HTTP ${hRes.status}`);
    if (!lRes.ok) throw new Error(`leaderboard HTTP ${lRes.status}`);
    if (!aRes.ok) throw new Error(`alerts HTTP ${aRes.status}`);
    const hJson = await hRes.json();
    const lJson = await lRes.json();
    const aJson = await aRes.json();
    historyEl.innerHTML = renderHistory(hJson?.data?.items ?? []);
    leaderboardEl.innerHTML = renderLeaderboard(lJson?.data?.items ?? []);
    if (alertsEl instanceof HTMLElement) {
      alertsEl.innerHTML = renderAlerts(aJson?.data?.items ?? []);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    historyEl.innerHTML = renderError(msg);
    leaderboardEl.innerHTML = renderError(msg);
    if (alertsEl instanceof HTMLElement) alertsEl.innerHTML = renderError(msg);
  }
}

function renderAlerts(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="backtesting__empty">Nenhuma degradacao de regime detectada.</div>`;
  }
  const rows = items
    .map((alert) => {
      const sevClass = alert.severity === "critical" ? "backtesting__alert--critical" : "backtesting__alert--warning";
      return `<tr class="${sevClass}">
        <td><strong>${alert.severity.toUpperCase()}</strong></td>
        <td><strong>${alert.asset}</strong></td>
        <td>${alert.strategy}</td>
        <td>${fmtPct(alert.baselineAvgPnlPercent)}</td>
        <td>${fmtPct(alert.recentAvgPnlPercent)}</td>
        <td><strong>${fmtPct(alert.deltaPnlPercent)}</strong></td>
        <td>${alert.baselineRoundsCount} → ${alert.recentRoundsCount}</td>
        <td>${fmtDate(alert.lastRanAtMs)}</td>
      </tr>`;
    })
    .join("");
  return `<table class="backtesting__table"><thead><tr>
      <th>Severidade</th><th>Ativo</th><th>Estrategia</th><th>PnL Base</th><th>PnL Recente</th><th>Delta</th><th>Base/Recente</th><th>Ultima</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

export function initBacktestingPanel() {
  const root = document.querySelector("#backtesting-panel");
  if (!(root instanceof HTMLElement)) {
    return;
  }
  root.innerHTML = `
    <div class="backtesting__container">
      <header class="backtesting__title">
        <h2>Backtesting Engine</h2>
        <p>Replay historico de estrategias canonicas sobre OHLC publico.</p>
      </header>
      ${buildForm()}
      <div class="backtesting__output" id="backtesting-output">${renderEmpty()}</div>
      <section class="backtesting__history-section">
        <header class="backtesting__section-header">
          <h3>Alertas de degradacao de regime</h3>
        </header>
        <div id="backtesting-alerts">${renderLoading()}</div>
      </section>
      <section class="backtesting__history-section">
        <header class="backtesting__section-header">
          <h3>Historico de comparacoes</h3>
          <button type="button" class="backtesting__refresh" id="backtesting-refresh">Atualizar</button>
        </header>
        <div id="backtesting-history">${renderLoading()}</div>
      </section>
      <section class="backtesting__history-section">
        <header class="backtesting__section-header">
          <h3>Leaderboard (PnL medio por ativo+estrategia)</h3>
        </header>
        <div id="backtesting-leaderboard">${renderLoading()}</div>
      </section>
    </div>
  `;

  const form = root.querySelector("#backtesting-form");
  const output = root.querySelector("#backtesting-output");
  const historyEl = root.querySelector("#backtesting-history");
  const leaderboardEl = root.querySelector("#backtesting-leaderboard");
  const alertsEl = root.querySelector("#backtesting-alerts");
  const refreshBtn = root.querySelector("#backtesting-refresh");
  if (
    !(form instanceof HTMLFormElement) ||
    !(output instanceof HTMLElement) ||
    !(historyEl instanceof HTMLElement) ||
    !(leaderboardEl instanceof HTMLElement)
  ) {
    return;
  }

  void refreshHistoryAndLeaderboard(historyEl, leaderboardEl, alertsEl);
  if (refreshBtn instanceof HTMLButtonElement) {
    refreshBtn.addEventListener("click", () => {
      void refreshHistoryAndLeaderboard(historyEl, leaderboardEl, alertsEl);
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const compareMode = formData.get("compareMode") === "on";
    const base = {
      asset: String(formData.get("asset") ?? "").trim(),
      broker: String(formData.get("broker") ?? "bybit"),
      range: String(formData.get("range") ?? "30d"),
      cooldownCandles: Number(formData.get("cooldownCandles") ?? 1),
      commissionPercent: Number(formData.get("commissionPercent") ?? 0),
      slippagePercent: Number(formData.get("slippagePercent") ?? 0),
    };
    if (compareMode) {
      const payload = {
        ...base,
        strategies: STRATEGIES.map((s) => ({ strategy: s.id })),
      };
      void executeCompare(payload, output).then(() => {
        void refreshHistoryAndLeaderboard(historyEl, leaderboardEl, alertsEl);
      });
      return;
    }
    const payload = {
      ...base,
      strategy: String(formData.get("strategy") ?? "ema_crossover"),
    };
    void executeRun(payload, output);
  });
}
