export const STALE_CHART_ASSET_GENERATION_ERROR = "StaleChartAssetGenerationError";

export function normalizeChartAssetGenerationToken(token) {
  if (!Number.isSafeInteger(token) || token < 0) {
    return null;
  }

  return token;
}

function nextGenerationToken(currentToken) {
  return currentToken >= Number.MAX_SAFE_INTEGER ? 1 : currentToken + 1;
}

function createStaleChartAssetGenerationError(input = {}) {
  const error = new Error("Resposta de contexto de ativo desatualizada descartada");
  error.name = STALE_CHART_ASSET_GENERATION_ERROR;
  error.currentToken = input.currentToken;
  error.requestToken = input.requestToken;
  return error;
}

export function isStaleChartAssetGenerationError(error) {
  return Boolean(error && error.name === STALE_CHART_ASSET_GENERATION_ERROR);
}

export function createChartAssetGeneration(input = {}) {
  let currentToken = normalizeChartAssetGenerationToken(input.initialToken) ?? 0;

  const getToken = () => currentToken;

  const resolveToken = (token) => normalizeChartAssetGenerationToken(token) ?? currentToken;

  const isCurrent = (token) => {
    const requestToken = normalizeChartAssetGenerationToken(token);
    return requestToken === null || requestToken === currentToken;
  };

  return {
    advance() {
      currentToken = nextGenerationToken(currentToken);
      return currentToken;
    },

    assertCurrent(token) {
      const requestToken = normalizeChartAssetGenerationToken(token);

      if (requestToken !== null && requestToken !== currentToken) {
        throw createStaleChartAssetGenerationError({
          currentToken,
          requestToken,
        });
      }

      return true;
    },

    getToken,
    isCurrent,
    resolveToken,
  };
}
