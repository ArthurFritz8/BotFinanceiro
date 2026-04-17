/**
 * Núcleo de primitivas Smart Money Concepts (SMC) / POI institucional compartilhável entre
 * motores operacionais (crypto, binary, futures, forex). Mantém fronteira fina e sem
 * dependências de domínio específico.
 *
 * Este módulo é o embrião de um futuro `packages/smc_core`; por ora vive em `apps/api/src/shared`
 * para não exigir configuração de project references no mesmo PR.
 */

export type InstitutionalZone = "discount" | "equilibrium" | "premium";

export interface InstitutionalZoneThresholds {
  /** Limite superior (exclusivo) da zona de discount. Default 0.35. */
  discountMax: number;
  /** Limite inferior (exclusivo) da zona de premium. Default 0.65. */
  premiumMin: number;
}

const DEFAULT_ZONE_THRESHOLDS: InstitutionalZoneThresholds = {
  discountMax: 0.35,
  premiumMin: 0.65,
};

/**
 * Classifica o preço atual em discount / equilibrium / premium dentro do range institucional.
 * Usa limiares parametrizáveis para permitir calibração por ativo / timeframe.
 */
export function resolveInstitutionalZone(
  currentPrice: number,
  supportLevel: number,
  resistanceLevel: number,
  thresholds: InstitutionalZoneThresholds = DEFAULT_ZONE_THRESHOLDS,
): InstitutionalZone {
  const range = Math.max(1e-8, resistanceLevel - supportLevel);
  const position = (currentPrice - supportLevel) / range;

  if (position <= thresholds.discountMax) {
    return "discount";
  }

  if (position >= thresholds.premiumMin) {
    return "premium";
  }

  return "equilibrium";
}

/**
 * Retorna a posição percentual (0-1) do preço dentro do range. Exposto para consumidores que
 * queiram renderizar barras de zona ou fundir com outras heurísticas.
 */
export function resolveZonePosition(
  currentPrice: number,
  supportLevel: number,
  resistanceLevel: number,
): number {
  const range = Math.max(1e-8, resistanceLevel - supportLevel);
  return Math.min(1, Math.max(0, (currentPrice - supportLevel) / range));
}
