import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const booleanFromString = z.enum(["true", "false"]).transform((value) => value === "true");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    SCHEDULER_ENABLED: booleanFromString.default("true"),
    SCHEDULER_ECONOMY_MODE: booleanFromString.default("false"),
    SCHEDULER_JITTER_MAX_PERCENT: z.coerce.number().int().min(0).max(100).default(20),
    CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(120),
    CACHE_STALE_SECONDS: z.coerce.number().int().positive().default(300),
    COINGECKO_API_BASE_URL: z.string().url(),
    COINGECKO_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    COINGECKO_DAILY_BUDGET: z.coerce.number().int().positive().default(1000),
    COINGECKO_MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(10),
    COINGECKO_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    COINGECKO_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(250),
    COINGECKO_RETRY_JITTER_PERCENT: z.coerce.number().int().min(0).max(100).default(25),
    COINGECKO_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(50).default(5),
    COINGECKO_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().default(60000),
    COINGECKO_CIRCUIT_ALERT_OPEN_CYCLES: z.coerce.number().int().min(1).max(100).default(3),
    COINGECKO_CIRCUIT_ALERT_COOLDOWN_MS: z.coerce.number().int().positive().default(300000),
    CRYPTO_SYNC_TARGET_CURRENCY: z
      .string()
      .trim()
      .min(2)
      .max(10)
      .transform((value) => value.toLowerCase())
      .default("usd"),
    CRYPTO_SYNC_HOT_ASSETS: z
      .string()
      .default("bitcoin,ethereum,solana")
      .transform((value) =>
        value
          .split(",")
          .map((asset) => asset.trim().toLowerCase())
          .filter((asset) => asset.length > 0),
      )
      .refine((assets) => assets.length > 0, "CRYPTO_SYNC_HOT_ASSETS must have at least one asset"),
    CRYPTO_SYNC_WARM_ASSETS: z
      .string()
      .default("chainlink,avalanche-2,polygon")
      .transform((value) =>
        value
          .split(",")
          .map((asset) => asset.trim().toLowerCase())
          .filter((asset) => asset.length > 0),
      )
      .refine((assets) => assets.length > 0, "CRYPTO_SYNC_WARM_ASSETS must have at least one asset"),
    CRYPTO_SYNC_COLD_ASSETS: z
      .string()
      .default("aave,maker,uniswap")
      .transform((value) =>
        value
          .split(",")
          .map((asset) => asset.trim().toLowerCase())
          .filter((asset) => asset.length > 0),
      )
      .refine((assets) => assets.length > 0, "CRYPTO_SYNC_COLD_ASSETS must have at least one asset"),
    INTERNAL_API_TOKEN: z.string().trim().default(""),
    INTERNAL_ALLOWED_IPS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((ip) => ip.trim())
          .filter((ip) => ip.length > 0),
      ),
    YAHOO_FINANCE_API_BASE_URL: z.string().url(),
    DATABASE_URL: z.union([z.string().url(), z.literal("")]).optional(),
    JWT_SECRET: z.union([z.string().min(16), z.literal("")]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") {
      return;
    }

    if (value.INTERNAL_API_TOKEN.length >= 16) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "INTERNAL_API_TOKEN must have at least 16 characters when NODE_ENV is production",
      path: ["INTERNAL_API_TOKEN"],
    });
  });

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment variables: ${details}`);
}

export const env = parsedEnvironment.data;

export type Environment = z.infer<typeof environmentSchema>;