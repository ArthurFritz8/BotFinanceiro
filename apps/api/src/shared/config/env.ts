import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const apiRootPath = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const repoRootPath = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));

const dotenvPaths = [
  resolve(process.cwd(), ".env"),
  resolve(apiRootPath, ".env"),
  resolve(repoRootPath, ".env"),
];

for (const dotenvPath of dotenvPaths) {
  loadDotEnv({
    override: false,
    path: dotenvPath,
  });
}

const booleanFromString = z.enum(["true", "false"]).transform((value) => value === "true");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim().replace(/\/$/, ""))
          .filter((origin) => origin.length > 0),
      ),
    PUBLIC_RATE_LIMIT_ENABLED: booleanFromString.default("true"),
    PUBLIC_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(10).max(10000).default(240),
    PUBLIC_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(600000).default(60000),
    SECURITY_HEADERS_ENABLED: booleanFromString.default("true"),
    SECURITY_HEADERS_HSTS_MAX_AGE_SECONDS: z.coerce.number().int().min(0).max(63072000).default(31536000),
    METRICS_ENABLED: booleanFromString.default("true"),
    PUSH_NOTIFICATIONS_ENABLED: booleanFromString.default("false"),
    VAPID_PUBLIC_KEY: z.string().default(""),
    VAPID_PRIVATE_KEY: z.string().default(""),
    VAPID_SUBJECT: z.string().default("mailto:notifications@botfinanceiro.local"),
    PAPER_TRADING_ENABLED: booleanFromString.default("true"),
    PAPER_TRADING_DATA_FILE: z.string().default("apps/api/data/paper-trading.jsonl"),
    AUTO_PAPER_TRADING_ENABLED: booleanFromString.default("true"),
    AUTO_PAPER_TRADING_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    AUTO_PAPER_TRADING_MIN_TIER: z.enum(["high", "medium"]).default("high"),
    AUTO_PAPER_TRADING_BROKER: z.enum(["bybit", "coinbase", "kraken", "okx"]).default("bybit"),
    BACKTESTING_ENABLED: booleanFromString.default("true"),
    BACKTESTING_HISTORY_DATA_FILE: z
      .string()
      .default("apps/api/data/backtesting-history.jsonl"),
    BACKTESTING_HISTORY_MAX_ENTRIES: z.coerce
      .number()
      .int()
      .min(10)
      .max(10000)
      .default(500),
    SCHEDULER_ENABLED: booleanFromString.default("true"),
    SCHEDULER_ECONOMY_MODE: booleanFromString.default("false"),
    SCHEDULER_JITTER_MAX_PERCENT: z.coerce.number().int().min(0).max(100).default(20),
    CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(120),
    CACHE_STALE_SECONDS: z.coerce.number().int().positive().default(300),
    MARKET_OVERVIEW_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(300).default(60),
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
    COINCAP_API_BASE_URL: z.string().url().default("https://api.coincap.io/v2"),
    COINCAP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    OPS_HEALTH_WARNING_BUDGET_PERCENT: z.coerce.number().min(0).max(100).default(20),
    OPS_HEALTH_CRITICAL_BUDGET_PERCENT: z.coerce.number().min(0).max(100).default(5),
    OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT: z.coerce.number().min(0).max(100).default(50),
    OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT: z.coerce.number().min(0).max(100).default(80),
    OPS_HEALTH_SNAPSHOT_ENABLED: booleanFromString.default("true"),
    OPS_HEALTH_SNAPSHOT_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
    OPS_HEALTH_SNAPSHOT_MAX_ITEMS: z.coerce.number().int().min(10).max(10000).default(300),
    OPS_HEALTH_SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    OPS_HEALTH_SNAPSHOT_FILE_PATH: z
      .string()
      .trim()
      .min(1)
      .default(".runtime/operational-health-history.json"),
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
    OPENROUTER_API_KEY: z.string().trim().default(""),
    OPENROUTER_MODEL: z.string().trim().min(1).default("anthropic/claude-3.5-haiku"),
    OPENROUTER_API_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
    OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    OPENROUTER_APP_NAME: z.string().trim().default("BotFinanceiro"),
    OPENROUTER_APP_URL: z.union([z.string().url(), z.literal("")]).default(""),
    WEB_SEARCH_PROVIDER_STRATEGY: z
      .enum([
        "tavily_only",
        "tavily_then_serper",
        "tavily_then_serper_then_serpapi",
      ])
      .default("tavily_then_serper"),
    WEB_SEARCH_DEXSCREENER_API_BASE_URL: z.string().url().default("https://api.dexscreener.com"),
    WEB_SEARCH_SERPER_API_BASE_URL: z.string().url().default("https://google.serper.dev"),
    WEB_SEARCH_SERPER_API_KEY: z.string().trim().default(""),
    WEB_SEARCH_SERPAPI_API_BASE_URL: z.string().url().default("https://serpapi.com"),
    WEB_SEARCH_SERPAPI_API_KEY: z.string().trim().default(""),
    WEB_SEARCH_TAVILY_API_BASE_URL: z.string().url().default("https://api.tavily.com"),
    WEB_SEARCH_TAVILY_API_KEY: z.string().trim().default(""),
    WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(7000),
    ONCHAIN_BIRDSEYE_API_BASE_URL: z.string().url().default("https://public-api.birdeye.so/defi"),
    ONCHAIN_BIRDSEYE_API_KEY: z.string().trim().default(""),
    ONCHAIN_BIRDSEYE_TIMEOUT_MS: z.coerce.number().int().positive().default(7000),
    COPILOT_CHAT_AUDIT_ENABLED: booleanFromString.default("true"),
    COPILOT_CHAT_AUDIT_MAX_ITEMS: z.coerce.number().int().min(50).max(200000).default(5000),
    COPILOT_CHAT_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    COPILOT_CHAT_AUDIT_FILE_PATH: z
      .string()
      .trim()
      .min(1)
      .default(".runtime/copilot-chat-audit.json"),
    BINARY_OPTIONS_GHOST_AUDIT_ENABLED: booleanFromString.default("true"),
    BINARY_OPTIONS_GHOST_AUDIT_MAX_ITEMS: z.coerce.number().int().min(50).max(200000).default(20000),
    BINARY_OPTIONS_GHOST_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(120),
    BINARY_OPTIONS_GHOST_AUDIT_FILE_PATH: z
      .string()
      .trim()
      .min(1)
      .default(".runtime/binary-options-ghost-audit.json"),
    YAHOO_FINANCE_API_BASE_URL: z.string().url(),
    YAHOO_FINANCE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    BINANCE_API_BASE_URL: z.string().url().default("https://api.binance.com"),
    BINANCE_WS_BASE_URL: z.string().url().default("wss://stream.binance.com:9443"),
    BINANCE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    BINANCE_FUTURES_API_BASE_URL: z.string().url().default("https://fapi.binance.com"),
    BINANCE_FUTURES_WS_ENABLED: booleanFromString.default("true"),
    BINANCE_FUTURES_WS_BASE_URL: z.string().url().default("wss://fstream.binance.com"),
    BINANCE_FUTURES_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    AIRDROPS_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
    AIRDROPS_MAX_ITEMS_PER_SOURCE: z.coerce.number().int().min(5).max(100).default(30),
    AIRDROPS_IO_SOURCE_URL: z.string().url().default("https://airdrops.io"),
    AIRDROP_ALERT_SOURCE_URL: z.string().url().default("https://airdropalert.com"),
    DEFILLAMA_API_BASE_URL: z.string().url().default("https://api.llama.fi"),
    AIRDROPS_DROPS_TAB_SOURCE_URL: z.union([z.string().url(), z.literal("")]).default(""),
    AIRDROPS_DROPS_TAB_API_KEY: z.string().trim().default(""),
    AIRDROPS_EARNIFI_SOURCE_URL: z.union([z.string().url(), z.literal("")]).default(""),
    AIRDROPS_EARNIFI_API_KEY: z.string().trim().default(""),
    MEME_RADAR_TIMEOUT_MS: z.coerce.number().int().positive().default(7000),
    MEME_RADAR_REFRESH_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    MEME_RADAR_NEW_POOLS_PER_CHAIN: z.coerce.number().int().min(2).max(30).default(8),
    MEME_RADAR_DEX_ENRICH_LIMIT: z.coerce.number().int().min(0).max(40).default(8),
    MEME_RADAR_AI_MAX_ITEMS: z.coerce.number().int().min(0).max(30).default(6),
    MEME_RADAR_CACHE_FRESH_SECONDS: z.coerce.number().int().positive().default(120),
    MEME_RADAR_CACHE_STALE_SECONDS: z.coerce.number().int().positive().default(300),
    MEME_RADAR_CONSENSUS_WEIGHT_BUNDLE_RISK: z.coerce.number().min(0).max(100).default(35),
    MEME_RADAR_CONSENSUS_WEIGHT_SECURITY_STATUS: z.coerce.number().min(0).max(100).default(25),
    MEME_RADAR_CONSENSUS_WEIGHT_LIQUIDITY_DEPTH: z.coerce.number().min(0).max(100).default(20),
    MEME_RADAR_CONSENSUS_WEIGHT_WEB_SIGNAL: z.coerce.number().min(0).max(100).default(10),
    MEME_RADAR_CONSENSUS_WEIGHT_COMMUNITY_HEALTH: z.coerce.number().min(0).max(100).default(10),
    FOREX_MACRO_CALENDAR_URL: z.union([z.string().url(), z.literal("")]).default(""),
    FOREX_MACRO_CALENDAR_API_KEY: z.string().trim().default(""),
    IQOPTION_ENABLED: booleanFromString.default("false"),
    IQOPTION_API_BASE_URL: z.union([z.string().url(), z.literal("")]).default(""),
    IQOPTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    DATABASE_PROVIDER: z.enum(["auto", "file", "postgres"]).default("auto"),
    DATABASE_AUTO_MIGRATE: booleanFromString.default("true"),
    DATABASE_URL: z.union([z.string().url(), z.literal("")]).default(""),
    DATABASE_SSL: booleanFromString.default("false"),
    DATABASE_SSL_REJECT_UNAUTHORIZED: booleanFromString.default("true"),
    JWT_SECRET: z.union([z.string().min(16), z.literal("")]).optional(),
  })
  .superRefine((value, ctx) => {
    const hasDatabaseUrl = value.DATABASE_URL.length > 0;
    const isPostgresConnectionString =
      value.DATABASE_URL.startsWith("postgres://") || value.DATABASE_URL.startsWith("postgresql://");

    if (hasDatabaseUrl && !isPostgresConnectionString) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL must start with postgres:// or postgresql://",
        path: ["DATABASE_URL"],
      });
    }

    if (value.DATABASE_PROVIDER === "postgres" && !hasDatabaseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required when DATABASE_PROVIDER is postgres",
        path: ["DATABASE_URL"],
      });
    }

    if (value.NODE_ENV !== "production") {
      return;
    }

    if (value.INTERNAL_API_TOKEN.length >= 16) {
      if (
        value.OPS_HEALTH_CRITICAL_BUDGET_PERCENT <= value.OPS_HEALTH_WARNING_BUDGET_PERCENT &&
        value.OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT >=
          value.OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT
      ) {
        return;
      }

      if (value.OPS_HEALTH_CRITICAL_BUDGET_PERCENT > value.OPS_HEALTH_WARNING_BUDGET_PERCENT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "OPS_HEALTH_CRITICAL_BUDGET_PERCENT must be less than or equal to OPS_HEALTH_WARNING_BUDGET_PERCENT",
          path: ["OPS_HEALTH_CRITICAL_BUDGET_PERCENT"],
        });
      }

      if (
        value.OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT <
        value.OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT must be greater than or equal to OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT",
          path: ["OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT"],
        });
      }

      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "INTERNAL_API_TOKEN must have at least 16 characters when NODE_ENV is production",
      path: ["INTERNAL_API_TOKEN"],
    });

    if (value.OPS_HEALTH_CRITICAL_BUDGET_PERCENT > value.OPS_HEALTH_WARNING_BUDGET_PERCENT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "OPS_HEALTH_CRITICAL_BUDGET_PERCENT must be less than or equal to OPS_HEALTH_WARNING_BUDGET_PERCENT",
        path: ["OPS_HEALTH_CRITICAL_BUDGET_PERCENT"],
      });
    }

    if (
      value.OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT <
      value.OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT must be greater than or equal to OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT",
        path: ["OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT"],
      });
    }
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