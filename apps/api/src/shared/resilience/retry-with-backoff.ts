interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  jitterPercent: number;
  shouldRetry?: (error: unknown) => boolean;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function computeDelayMs(baseDelayMs: number, attemptIndex: number, jitterPercent: number): number {
  const exponentialDelay = baseDelayMs * 2 ** attemptIndex;
  const jitterFactor = Math.random() * (jitterPercent / 100);

  return Math.round(exponentialDelay * (1 + jitterFactor));
}

export async function retryWithExponentialBackoff<TValue>(
  operation: () => Promise<TValue>,
  options: RetryOptions,
): Promise<TValue> {
  let lastError: unknown;

  for (let attemptIndex = 0; attemptIndex < options.attempts; attemptIndex += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const shouldRetry = options.shouldRetry ? options.shouldRetry(error) : true;
      const hasNextAttempt = attemptIndex < options.attempts - 1;

      if (!shouldRetry || !hasNextAttempt) {
        throw error;
      }

      const delayMs = computeDelayMs(options.baseDelayMs, attemptIndex, options.jitterPercent);
      await sleep(delayMs);
    }
  }

  throw lastError;
}