import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const booleanFromString = z.enum(["true", "false"]).transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SCHEDULER_ENABLED: booleanFromString.default("true"),
  SCHEDULER_ECONOMY_MODE: booleanFromString.default("false"),
  CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  CACHE_STALE_SECONDS: z.coerce.number().int().positive().default(300),
  COINGECKO_API_BASE_URL: z.string().url(),
  COINGECKO_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  YAHOO_FINANCE_API_BASE_URL: z.string().url(),
  DATABASE_URL: z.union([z.string().url(), z.literal("")]).optional(),
  JWT_SECRET: z.union([z.string().min(16), z.literal("")]).optional(),
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