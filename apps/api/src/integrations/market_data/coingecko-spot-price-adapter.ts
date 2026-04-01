import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";

const spotPriceRequestSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  currency: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .transform((value) => value.toLowerCase()),
});

const coinGeckoSimplePriceSchema = z.record(z.string(), z.record(z.string(), z.number()));

export interface SpotPriceData {
  assetId: string;
  currency: string;
  fetchedAt: string;
  price: number;
  provider: "coingecko";
}

export class CoinGeckoSpotPriceAdapter {
  public async getSpotPrice(input: { assetId: string; currency: string }): Promise<SpotPriceData> {
    const parsedInput = spotPriceRequestSchema.parse(input);

    const query = new URLSearchParams({
      ids: parsedInput.assetId,
      vs_currencies: parsedInput.currency,
    });

    const requestUrl = `${env.COINGECKO_API_BASE_URL}/simple/price?${query.toString()}`;

    let response: Response;

    try {
      response = await fetch(requestUrl, {
        method: "GET",
        signal: AbortSignal.timeout(env.COINGECKO_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "COINGECKO_UNAVAILABLE",
        details: {
          assetId: parsedInput.assetId,
          cause: error,
          currency: parsedInput.currency,
        },
        message: "CoinGecko request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      throw new AppError({
        code: "COINGECKO_BAD_STATUS",
        details: {
          assetId: parsedInput.assetId,
          currency: parsedInput.currency,
          responseStatus: response.status,
        },
        message: "CoinGecko returned a non-success status",
        statusCode: 503,
      });
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new AppError({
        code: "COINGECKO_INVALID_JSON",
        details: {
          assetId: parsedInput.assetId,
          currency: parsedInput.currency,
        },
        message: "CoinGecko returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = coinGeckoSimplePriceSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "COINGECKO_SCHEMA_MISMATCH",
        details: parsedPayload.error.issues,
        message: "CoinGecko payload schema mismatch",
        statusCode: 502,
      });
    }

    const assetPayload = parsedPayload.data[parsedInput.assetId];
    const assetPrice = assetPayload?.[parsedInput.currency];

    if (typeof assetPrice !== "number" || Number.isNaN(assetPrice)) {
      throw new AppError({
        code: "COINGECKO_PRICE_NOT_FOUND",
        details: {
          assetId: parsedInput.assetId,
          currency: parsedInput.currency,
        },
        message: "Price not found in CoinGecko payload",
        statusCode: 502,
      });
    }

    return {
      assetId: parsedInput.assetId,
      currency: parsedInput.currency,
      fetchedAt: new Date().toISOString(),
      price: assetPrice,
      provider: "coingecko",
    };
  }
}