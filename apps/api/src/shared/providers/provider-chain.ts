import type { CircuitBreaker } from "../resilience/circuit-breaker.js";

export type ProviderChainTelemetryEvent =
  | {
      kind: "attempt";
      providerName: string;
    }
  | {
      kind: "success";
      providerName: string;
      durationMs: number;
    }
  | {
      kind: "failure";
      providerName: string;
      durationMs: number;
      error: unknown;
    }
  | {
      kind: "skipped_open_circuit";
      providerName: string;
    };

export interface ProviderChainTelemetry {
  onEvent: (event: ProviderChainTelemetryEvent) => void;
}

export interface Provider<TInput, TValue> {
  execute: (input: TInput) => Promise<TValue>;
  name: string;
}

export interface ProviderChainOptions<TInput, TValue> {
  breakerByProvider?: Map<string, CircuitBreaker>;
  providers: Provider<TInput, TValue>[];
  /**
   * Return `true` to stop the chain and rethrow (non-transient errors).
   * Default: never abort (always fallback).
   */
  shouldAbortChain?: (error: unknown) => boolean;
  telemetry?: ProviderChainTelemetry;
}

export interface ProviderChainSuccess<TValue> {
  providerName: string;
  status: "success";
  value: TValue;
}

export interface ProviderChainFailure {
  errors: { error: unknown; providerName: string }[];
  status: "exhausted";
}

export type ProviderChainResult<TValue> = ProviderChainSuccess<TValue> | ProviderChainFailure;

/**
 * Executes providers sequentially, honoring circuit breakers per provider and emitting telemetry
 * on every attempt. Returns the first success; on total exhaustion returns the accumulated errors.
 */
export class ProviderChain<TInput, TValue> {
  private readonly breakerByProvider: Map<string, CircuitBreaker>;
  private readonly providers: Provider<TInput, TValue>[];
  private readonly shouldAbortChain: (error: unknown) => boolean;
  private readonly telemetry: ProviderChainTelemetry | undefined;

  public constructor(options: ProviderChainOptions<TInput, TValue>) {
    this.providers = options.providers;
    this.breakerByProvider = options.breakerByProvider ?? new Map<string, CircuitBreaker>();
    this.shouldAbortChain = options.shouldAbortChain ?? (() => false);
    this.telemetry = options.telemetry;
  }

  public async execute(input: TInput): Promise<ProviderChainResult<TValue>> {
    const errors: { error: unknown; providerName: string }[] = [];

    for (const provider of this.providers) {
      const breaker = this.breakerByProvider.get(provider.name);

      if (breaker && !breaker.canRequest()) {
        this.emit({ kind: "skipped_open_circuit", providerName: provider.name });
        errors.push({
          error: new Error(`Circuit breaker aberto para provider ${provider.name}`),
          providerName: provider.name,
        });
        continue;
      }

      this.emit({ kind: "attempt", providerName: provider.name });
      const startedAtMs = Date.now();

      try {
        const value = await provider.execute(input);
        const durationMs = Date.now() - startedAtMs;

        breaker?.onSuccess();
        this.emit({ durationMs, kind: "success", providerName: provider.name });

        return { providerName: provider.name, status: "success", value };
      } catch (error) {
        const durationMs = Date.now() - startedAtMs;

        breaker?.onFailure();
        this.emit({ durationMs, error, kind: "failure", providerName: provider.name });
        errors.push({ error, providerName: provider.name });

        if (this.shouldAbortChain(error)) {
          return { errors, status: "exhausted" };
        }
      }
    }

    return { errors, status: "exhausted" };
  }

  private emit(event: ProviderChainTelemetryEvent): void {
    if (!this.telemetry) {
      return;
    }

    try {
      this.telemetry.onEvent(event);
    } catch {
      // Telemetry deve ser o mais passivo possivel: nunca derrubar o pipeline de dados.
    }
  }
}
