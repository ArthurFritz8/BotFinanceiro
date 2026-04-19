import type { Candle } from "./backtest-types.js";

/**
 * SMC Analyzer (Smart Money Concepts) — primitives PURAS sobre OHLC.
 *
 * Esta extracao reproduz, em forma minimalista e operavel sobre o tipo
 * `Candle` do backtest, os blocos de logica SMC presentes hoje em
 * `crypto/application/crypto-chart-service.ts` (que opera sobre
 * `CryptoChartPoint` e nao e diretamente reutilizavel pelo engine).
 *
 * NAO substitui nem altera o servico de mesa inteligente — apenas oferece
 * uma alternativa puramente algoritmica (deterministica, sem timezone /
 * sessao / volatilidade contextual) que pode ser plugada como estrategia
 * de backtest. Mantemos o original intocado para evitar regressao na
 * Mesa Inteligente.
 */

export interface SwingPoint {
  readonly index: number;
  readonly price: number;
  readonly kind: "high" | "low";
}

export type StructureBias = "bullish" | "bearish" | "neutral";

export interface StructureSnapshot {
  readonly bias: StructureBias;
  readonly lastSwingHigh: SwingPoint | null;
  readonly lastSwingLow: SwingPoint | null;
  /** True se o candle do indice avaliado disparou um BOS bullish. */
  readonly bosBullish: boolean;
  /** True se o candle do indice avaliado disparou um BOS bearish. */
  readonly bosBearish: boolean;
}

const BOS_TOLERANCE = 0.0008; // 0.08% — ecoa o filtro do crypto-chart-service.ts

/**
 * Detecta swing highs/lows ate o `endIndex` (inclusivo) usando uma janela
 * `lookAround` simetrica. Replica o comportamento de
 * `detectSwingPoints` do servico cripto, porem sobre `Candle.high/low`.
 */
export function detectSwingPoints(
  candles: ReadonlyArray<Candle>,
  endIndex: number,
  lookAround = 2,
): ReadonlyArray<SwingPoint> {
  const swings: SwingPoint[] = [];
  const limit = Math.min(endIndex, candles.length - 1);
  for (let i = lookAround; i <= limit - lookAround; i += 1) {
    const candle = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookAround; j <= i + lookAround; j += 1) {
      if (j === i) continue;
      const other = candles[j]!;
      if (other.high >= candle.high) isHigh = false;
      if (other.low <= candle.low) isLow = false;
    }
    if (isHigh) {
      swings.push({ index: i, price: candle.high, kind: "high" });
    } else if (isLow) {
      swings.push({ index: i, price: candle.low, kind: "low" });
    }
  }
  return swings;
}

/**
 * Calcula o snapshot de estrutura no candle `index`. Detecta BOS olhando
 * para o close do candle vs ultimo swing high/low CONFIRMADO antes de `index`.
 */
export function computeStructureSnapshot(
  candles: ReadonlyArray<Candle>,
  index: number,
  lookAround = 2,
): StructureSnapshot {
  // Swings sao confirmados com `lookAround` a direita, entao so consideramos
  // swings cujo proprio indice + lookAround <= index - 1 (estritamente antes).
  const swings = detectSwingPoints(candles, index - 1, lookAround).filter(
    (s) => s.index + lookAround <= index - 1,
  );
  let lastSwingHigh: SwingPoint | null = null;
  let lastSwingLow: SwingPoint | null = null;
  for (const swing of swings) {
    if (swing.kind === "high") lastSwingHigh = swing;
    else lastSwingLow = swing;
  }

  const close = candles[index]!.close;
  const bosBullish =
    lastSwingHigh !== null &&
    close > lastSwingHigh.price * (1 + BOS_TOLERANCE);
  const bosBearish =
    lastSwingLow !== null &&
    close < lastSwingLow.price * (1 - BOS_TOLERANCE);

  let bias: StructureBias = "neutral";
  if (bosBullish && !bosBearish) bias = "bullish";
  else if (bosBearish && !bosBullish) bias = "bearish";

  return { bias, lastSwingHigh, lastSwingLow, bosBullish, bosBearish };
}

/**
 * Pontuacao de confluencia derivada da estrutura local (0..100). Inspirada
 * na soma ponderada do `computeSmcConfluence`, mas focada apenas no que
 * podemos extrair PURAMENTE de OHLC sem timezone/sessao:
 *
 * - +50 quando ha BOS valido no candle.
 * - +25 quando o swing oposto esta dentro de uma janela razoavel de R:R
 *   (definido externamente — aqui apenas reportamos se existe stop natural).
 * - +25 escalado pela "qualidade" do BOS (quanto o close ultrapassou o swing).
 */
export function computeSmcScore(snapshot: StructureSnapshot, close: number): number {
  if (snapshot.bias === "neutral") return 0;
  let score = 50;
  const oppositeSwing =
    snapshot.bias === "bullish" ? snapshot.lastSwingLow : snapshot.lastSwingHigh;
  if (oppositeSwing) score += 25;
  const breakRef =
    snapshot.bias === "bullish"
      ? snapshot.lastSwingHigh?.price ?? close
      : snapshot.lastSwingLow?.price ?? close;
  const breakRatio = Math.abs(close - breakRef) / breakRef;
  // 0..0.02 (2%) -> 0..25
  const qualityBonus = Math.min(25, breakRatio * 1250);
  score += qualityBonus;
  return Math.min(100, Math.max(0, score));
}
