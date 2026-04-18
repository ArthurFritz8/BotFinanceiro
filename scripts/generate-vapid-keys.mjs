#!/usr/bin/env node
/**
 * Gera um par de chaves VAPID (P-256, formato base64url URL-safe) para Web Push.
 *
 * Uso:
 *   node scripts/generate-vapid-keys.mjs
 *
 * Cole as chaves geradas no arquivo `.env` (campos VAPID_PUBLIC_KEY e
 * VAPID_PRIVATE_KEY) e habilite `PUSH_NOTIFICATIONS_ENABLED=true`.
 *
 * Spec: RFC 8292 (Voluntary Application Server Identification for Web Push).
 * Implementacao: usa a biblioteca `web-push` ja presente nas dependencias da API.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webpush = require("../apps/api/node_modules/web-push");

const keys = webpush.generateVAPIDKeys();

console.log("VAPID keypair gerado com sucesso.\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("\nCole essas linhas no seu arquivo .env e ajuste VAPID_SUBJECT");
console.log("para um mailto:seu@email valido. Ative com PUSH_NOTIFICATIONS_ENABLED=true.");
