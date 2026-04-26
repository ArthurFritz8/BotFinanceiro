// ADR-110: Calibração explícita das constantes do Micro-Timing binário.
//
// Esses valores eram literais inline em apps/web/src/main.js, sem rastreabilidade
// de origem. Foram extraídos sem alteração numérica para auditabilidade — qualquer
// mudança nos coeficientes exige nova ADR (ou complemento à ADR-110) descrevendo
// o backtest/ghost tracker que justifica o ajuste, conforme governança do projeto.
//
// Origem heurística:
//  - Faixas de directional bias / momentum boost calibradas durante ADR-076
//    (Timing Desk Institucional) e ADR-049 (Ghost Tracker), validadas em sessão
//    contra histórico de cripto HOT/WARM.
//  - Pesos do trigger heat e thresholds HOT/WARM derivam do mesmo período de
//    ghost-shadow de ADR-049, com ajustes empíricos para reduzir falsos quentes
//    em janelas de baixa neutralidade.

// ---------------------------------------------------------------------------
// resolveBinaryOptionsInstitutionalDirectionalBias — bias por tipo de POI
// ---------------------------------------------------------------------------
export const POI_BIAS_PREVIOUS_LOW = 1;
export const POI_BIAS_PREVIOUS_HIGH = -1;
export const POI_BIAS_MIDNIGHT_OPEN = 0.45;
export const POI_BIAS_CLUSTER = 0.65;

// ---------------------------------------------------------------------------
// buildBinaryOptionsInstitutionalKineticContext — contexto cinético
// ---------------------------------------------------------------------------

// Multiplicador da aceleração (%/s²) para derivar bias direcional, com clamp ±.
export const KINETIC_ACCELERATION_BIAS_SCALE = 7000;
export const KINETIC_ACCELERATION_BIAS_CLAMP = 3.5;

// Em estado "cooling": % do decelerationStrength absorvida como bias positivo.
export const KINETIC_COOLING_BIAS_SCALE = 0.06;
export const KINETIC_COOLING_BIAS_CLAMP = 3.4;

// Em estado "explosive": bias fixo (penaliza engajamento direcional).
export const KINETIC_EXPLOSIVE_BIAS = -2.8;

// Composição final do directionalBias.
export const INSTITUTIONAL_BIAS_WEIGHT = 5;
export const DIRECTIONAL_BIAS_CLAMP = 9;

// momentumStrengthBoost: bônus/penalidade por contexto institucional.
export const MOMENTUM_BOOST_POI_HIT = 4;
export const MOMENTUM_BOOST_COOLING_DECEL_SCALE = 0.2;
export const MOMENTUM_BOOST_EXPLOSIVE = -6;
export const MOMENTUM_BOOST_CLAMP_MIN = -10;
export const MOMENTUM_BOOST_CLAMP_MAX = 24;

// neutralProbabilityAdjustment: ajustes pontuais na probabilidade neutra.
export const NEUTRAL_ADJ_EXPLOSIVE = 8;
export const NEUTRAL_ADJ_POI_COOLING = -6;
export const NEUTRAL_ADJ_POI_ONLY = -2;

// Limiares textuais para a label de poiBias na UI.
export const POI_BIAS_LABEL_BUYER_THRESHOLD = 2;
export const POI_BIAS_LABEL_SELLER_THRESHOLD = -2;

// ---------------------------------------------------------------------------
// resolveBinaryOptionsTriggerHeat — score e thresholds HOT/WARM/COLD
// ---------------------------------------------------------------------------
export const TRIGGER_HEAT_DIRECTIONAL_WEIGHT = 0.62;
export const TRIGGER_HEAT_MOMENTUM_WEIGHT = 0.48;
export const TRIGGER_HEAT_NEUTRAL_PENALTY = 0.35;

export const TRIGGER_HEAT_HOT_DIRECTIONAL_MIN = 79;
export const TRIGGER_HEAT_HOT_MOMENTUM_MIN = 68;
export const TRIGGER_HEAT_HOT_NEUTRAL_MAX = 18;

export const TRIGGER_HEAT_WARM_DIRECTIONAL_MIN = 69;
export const TRIGGER_HEAT_WARM_MOMENTUM_MIN = 44;
export const TRIGGER_HEAT_WARM_NEUTRAL_MAX = 30;

// ---------------------------------------------------------------------------
// buildMicroTimingAnalysis — composição do momentum e probabilidades
// ---------------------------------------------------------------------------

// Blend entre estimativa local de momentum e velocidade reportada pelo backend.
export const BACKEND_MOMENTUM_BLEND_LOCAL_WEIGHT = 0.6;
export const BACKEND_MOMENTUM_BLEND_REMOTE_WEIGHT = 0.4;

// Amplificação da aceleração cinética dentro da composição de momentum final.
export const KINETIC_ACCELERATION_MOMENTUM_FACTOR = 4;

// Escala que converte momentum (%/s) em força 0-100 (granularidade da UI).
export const MOMENTUM_STRENGTH_SCALE = 1400;

// Limiar de momentum (%/s) para classificar direção comprador/vendedor.
export const MOMENTUM_DIRECTION_THRESHOLD = 0.004;

// Conversão de momentum em viés CALL/PUT, com clamp simétrico.
export const MOMENTUM_BIAS_SCALE = 1200;
export const MOMENTUM_BIAS_CLAMP = 14;

// Bônus aplicado ao lado cujo signal.tone alinha (buy/sell).
export const SIGNAL_TONE_BIAS_BONUS = 4;

// Clamps de probabilidade individual antes da normalização.
export const PROBABILITY_CLAMP_MIN = 1;
export const PROBABILITY_CLAMP_MAX = 98;

// Boost da probabilidade neutra conforme momentum:
//   momentumStrength <  NEUTRAL_LOW_MOMENTUM_THRESHOLD  → +NEUTRAL_BASE_BOOST_LOW_MOMENTUM
//   caso contrário                                       → +NEUTRAL_BASE_BOOST_DEFAULT
export const NEUTRAL_BASE_BOOST_LOW_MOMENTUM = 6;
export const NEUTRAL_BASE_BOOST_DEFAULT = 2;
export const NEUTRAL_LOW_MOMENTUM_THRESHOLD = 28;
export const NEUTRAL_PROBABILITY_CLAMP_MAX = 45;

// Faixas textuais para momentumLabel.
export const MOMENTUM_LABEL_STRONG_THRESHOLD = 72;
export const MOMENTUM_LABEL_MODERATE_THRESHOLD = 45;

// Sugestão de expiry binária a partir do espaçamento médio de candles.
export const SUGGESTED_EXPIRY_BAR_MULTIPLIER = 3;
export const SUGGESTED_EXPIRY_MIN_SECONDS = 15;
export const SUGGESTED_EXPIRY_MAX_SECONDS = 300;
