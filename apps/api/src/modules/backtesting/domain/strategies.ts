import type {
  Candle,
  EmaCrossoverParams,
  RsiMeanReversionParams,
  SmcConfluenceParams,
  StrategySignal,
} from "./backtest-types.js";
import { computeSmcScore, computeStructureSnapshot } from "./smc-analyzer.js";

/**
 * Estrategias puras: dado o array de candles e o indice atual, retornam um
 * sinal (ou null). NAO mantem estado externo — o engine pode chamar com
 * qualquer indice em qualquer ordem (idealmente sequencial). Funcoes
 * pequenas e auditaveis a olho nu.
 */

/**
 * EMA simples calculada incremental ate o indice `endIndex` (inclusivo).
 * Retorna `null` se nao houver candles suficientes (`period`).
 */
export function computeEma(
  candles: ReadonlyArray<Candle>,
  endIndex: number,
  period: number,
): number | null {
  if (endIndex < period - 1) {
    return null;
  }
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i <= period - 1; i += 1) {
    ema += candles[i]!.close;
  }
  ema = ema / period;
  for (let i = period; i <= endIndex; i += 1) {
    const close = candles[i]!.close;
    ema = close * k + ema * (1 - k);
  }
  return ema;
}

/**
 * RSI Wilder classico ate o indice endIndex.
 * Retorna null se candles insuficientes (`period + 1`).
 */
export function computeRsi(
  candles: ReadonlyArray<Candle>,
  endIndex: number,
  period: number,
): number | null {
  if (endIndex < period) {
    return null;
  }
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = candles[i]!.close - candles[i - 1]!.close;
    if (diff >= 0) {
      gainSum += diff;
    } else {
      lossSum += -diff;
    }
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i <= endIndex; i += 1) {
    const diff = candles[i]!.close - candles[i - 1]!.close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) {
    return 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * EMA crossover: long quando fast cruza acima da slow, short quando fast
 * cruza abaixo. Stop/target derivados em % do entry.
 */
export function emaCrossoverStrategy(
  candles: ReadonlyArray<Candle>,
  index: number,
  params: EmaCrossoverParams,
): StrategySignal | null {
  if (index < params.slowPeriod) {
    return null;
  }
  const fastNow = computeEma(candles, index, params.fastPeriod);
  const slowNow = computeEma(candles, index, params.slowPeriod);
  const fastPrev = computeEma(candles, index - 1, params.fastPeriod);
  const slowPrev = computeEma(candles, index - 1, params.slowPeriod);
  if (
    fastNow === null ||
    slowNow === null ||
    fastPrev === null ||
    slowPrev === null
  ) {
    return null;
  }
  const entryPrice = candles[index]!.close;
  const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
  const crossedDown = fastPrev >= slowPrev && fastNow < slowNow;
  if (crossedUp) {
    return {
      side: "long",
      entryPrice,
      stopPrice: entryPrice * (1 - params.stopLossPercent / 100),
      targetPrice: entryPrice * (1 + params.takeProfitPercent / 100),
    };
  }
  if (crossedDown) {
    return {
      side: "short",
      entryPrice,
      stopPrice: entryPrice * (1 + params.stopLossPercent / 100),
      targetPrice: entryPrice * (1 - params.takeProfitPercent / 100),
    };
  }
  return null;
}

/**
 * RSI mean reversion: long quando RSI cruza para cima do oversold, short
 * quando cruza para baixo do overbought.
 */
export function rsiMeanReversionStrategy(
  candles: ReadonlyArray<Candle>,
  index: number,
  params: RsiMeanReversionParams,
): StrategySignal | null {
  if (index < params.period + 1) {
    return null;
  }
  const rsiNow = computeRsi(candles, index, params.period);
  const rsiPrev = computeRsi(candles, index - 1, params.period);
  if (rsiNow === null || rsiPrev === null) {
    return null;
  }
  const entryPrice = candles[index]!.close;
  const crossedUpFromOversold =
    rsiPrev <= params.oversold && rsiNow > params.oversold;
  const crossedDownFromOverbought =
    rsiPrev >= params.overbought && rsiNow < params.overbought;
  if (crossedUpFromOversold) {
    return {
      side: "long",
      entryPrice,
      stopPrice: entryPrice * (1 - params.stopLossPercent / 100),
      targetPrice: entryPrice * (1 + params.takeProfitPercent / 100),
    };
  }
  if (crossedDownFromOverbought) {
    return {
      side: "short",
      entryPrice,
      stopPrice: entryPrice * (1 + params.stopLossPercent / 100),
      targetPrice: entryPrice * (1 - params.takeProfitPercent / 100),
    };
  }
  return null;
}

/**
 * SMC Confluence Strategy (Wave 19 / ADR-059): emite signal quando o
 * candle do indice atual dispara um BOS (Break of Structure) bullish ou
 * bearish e o score de confluencia local atinge `minScore`.
 *
 * Stop = swing oposto (bullish: lastSwingLow; bearish: lastSwingHigh) com
 * `stopBufferPercent` extra. Target derivado por R:R configuravel
 * (`riskRewardRatio`). Se nao houver swing oposto valido, descarta o
 * sinal (sem stop natural -> sem trade).
 */
export function smcConfluenceStrategy(
  candles: ReadonlyArray<Candle>,
  index: number,
  params: SmcConfluenceParams,
): StrategySignal | null {
  if (index < params.lookAround * 2 + 1) {
    return null;
  }
  const snapshot = computeStructureSnapshot(candles, index, params.lookAround);
  if (snapshot.bias === "neutral") return null;
  const close = candles[index]!.close;
  const score = computeSmcScore(snapshot, close);
  if (score < params.minScore) return null;

  const buffer = params.stopBufferPercent / 100;
  if (snapshot.bias === "bullish" && snapshot.lastSwingLow) {
    const rawStop = snapshot.lastSwingLow.price * (1 - buffer);
    if (rawStop >= close) return null; // stop invalido (acima do entry)
    const risk = close - rawStop;
    const targetPrice = close + risk * params.riskRewardRatio;
    return {
      side: "long",
      entryPrice: close,
      stopPrice: rawStop,
      targetPrice,
    };
  }
  if (snapshot.bias === "bearish" && snapshot.lastSwingHigh) {
    const rawStop = snapshot.lastSwingHigh.price * (1 + buffer);
    if (rawStop <= close) return null;
    const risk = rawStop - close;
    const targetPrice = close - risk * params.riskRewardRatio;
    if (targetPrice <= 0) return null;
    return {
      side: "short",
      entryPrice: close,
      stopPrice: rawStop,
      targetPrice,
    };
  }
  return null;
}
