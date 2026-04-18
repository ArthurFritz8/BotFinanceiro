# ADR-054: Web Push notifications zero-cost (RFC 8030 + VAPID RFC 8292)

- Status: Aceito
- Data: 2026-04-22
- Wave: 14

## Contexto

O projeto evolui em modo "maximo possivel com custo zero" (apice gratuito
antes de assinar APIs pagas). O usuario hoje precisa **ficar olhando a tela**
para nao perder setups fortes (confluencia >= 4 no Intelligence Desk 360,
ADR-048). Isso limita drasticamente a utilidade pratica do bot — ninguem fica
24/7 monitorando o navegador.

A Web Push API (RFC 8030) com identificacao VAPID (RFC 8292) eh o padrao W3C
suportado em **todos os browsers modernos** (Chrome, Edge, Firefox, Opera,
Brave, Safari 16.4+) e em **Android Chrome / iOS Safari (instalado como PWA
em iOS 16.4+)**, **sem custo recorrente algum** — usa a propria infraestrutura
de push do browser (FCM, Mozilla autopush, APNs, etc.) de forma transparente.

Ja temos service worker registrado via `vite-plugin-pwa` (estrategia
`generateSW`) e icones PWA. Falta apenas a camada de subscription + envio.

## Decisao

### Backend (`apps/api/src/modules/notifications/`)

Modulo Clean Architecture novo:

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| domain | `notification-types.ts` | Schemas Zod de PushSubscription / NotificationPayload / BroadcastResult |
| infrastructure | `in-memory-push-subscription-store.ts` | Map<endpoint, subscription> in-process |
| infrastructure | `web-push-sender.ts` | Wrapper sobre `web-push` v3.6 (lib npm MIT) com classificacao gone/failed |
| application | `notification-service.ts` | Orquestra subscribe/unsubscribe/broadcast, remove gone (404/410) atomicamente |
| interface | `notifications-controller.ts` | Validacao Zod + responses padrao API |
| interface | `notifications-routes.ts` | `registerPublicRoutes` (dentro `/v1`) + `registerInternalRoutes` (fora) |

Rotas:

- `GET /v1/notifications/vapid-public-key` — publica chave para subscribe
- `POST /v1/notifications/subscribe` — recebe PushSubscription do browser
- `POST /v1/notifications/unsubscribe` — body `{endpoint}`
- `POST /internal/notifications/broadcast` — protegida por `assertInternalRouteAuth`
  (ADR-007/008), aceita `{title, body, icon?, tag?, url?, data?}`

Env vars:

- `PUSH_NOTIFICATIONS_ENABLED` (default `false` — habilitar manualmente apos
  configurar VAPID)
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`

Geracao de chaves: `node scripts/generate-vapid-keys.mjs`.

### Frontend (`apps/web`)

- `public/push-handler.js`: registra `push` e `notificationclick` no SW.
  Importado pelo SW do workbox via `vite.config.js` -> `workbox.importScripts`.
- `src/shared/push-notifications.js`: detecta suporte, busca chave VAPID,
  pede permissao, chama `pushManager.subscribe`, envia ao backend, atualiza UI.
- `index.html` + `styles.css`: botao `#push-notifications-toggle` na header
  do chat com 4 estados (`default`, `subscribed`, `denied`, `unsupported`).

### Decisoes-chave

1. **Store in-memory** para o MVP. Subscriptions sobrevivem a reload do SW
   no browser (frontend reassina via `getSubscription()`); persistencia
   server-side fica para evolucao (`push_subscriptions` table SQLite/PG).
2. **`web-push` lib npm** (MIT, mantida): implementar criptografia AES128GCM
   + ECDH manualmente seria reinventar a roda criticamente (RFC 8291 e' denso).
3. **`workbox.importScripts`** ao inves de migrar para `injectManifest`:
   preserva config existente do `generateSW` (autoUpdate, manifest, icons),
   menor risco de regressao no PWA.
4. **`PUSH_NOTIFICATIONS_ENABLED=false` por padrao**: failure-open, exige opt-in
   explicito apos gerar chaves. Backend nao falha se VAPID estiver vazio — apenas
   o GET vapid-public-key responde 503 e o broadcast vira no-op.
5. **Remocao automatica em gone (404/410)**: o sender classifica e o service
   limpa o store, evitando fila infinita de envios para subscriptions revogadas.

## Consequencias

Positivas:

- Usuario passa a USAR o bot mesmo longe do PC: alerta no celular toca quando
  setup forte aparece. **Maior salto de utilidade pratica do projeto ate agora.**
- Zero custo recorrente. Funciona em todos browsers e PWA.
- Reusa a infra existente de SW (PWA, autoUpdate).
- Padroes W3C/IETF: portavel para qualquer push provider.

Neutras:

- Subscriptions em memoria sao perdidas em restart. Frontend reassina
  automaticamente em pageload (custo: 1 fetch + 1 RTT ao push provider).

Negativas:

- Lib `web-push` adiciona ~13 deps transitivas (auditadas, MIT). Aceitavel.
- `web-push` reportou 1 high severity advisory na cadeia (a auditar
  separadamente; nenhuma versao corrige no momento — aceito como risco residual
  para MVP, monitorar GHSA).

## Como usar (operador)

```bash
# 1. Gerar par VAPID (uma vez)
node scripts/generate-vapid-keys.mjs

# 2. Colar VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env
# 3. Setar PUSH_NOTIFICATIONS_ENABLED=true
# 4. Reiniciar API
# 5. Frontend: clicar "Ativar alertas" na header do chat
# 6. Disparar broadcast manual (teste):
curl -X POST http://localhost:3000/internal/notifications/broadcast \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"BTC | Setup forte","body":"Confluencia 5/5 - long","url":"/"}'
```

Integracao com scheduler de sinais (auto-broadcast quando confluencia >= 4):
proxima ADR (escopo separado para nao acoplar instrumentacao a entrega base).

## Alternativas consideradas

1. **Telegram Bot API** — gratuita, robusta, mas exige usuario conectar
   conta + nao funciona como notificacao nativa do SO em Desktop. Pode ser
   adicionada em paralelo no futuro.
2. **E-mail (SMTP gratis tipo Brevo free tier)** — alta latencia, alta
   probabilidade de spam, ruim para alertas tempo-real.
3. **WebSocket persistente + alerta in-app** — exige aba aberta, contraria o
   objetivo (usuario longe da tela).
4. **Persistir subscriptions ja na primeira entrega** — aumenta escopo;
   in-memory eh suficiente para MVP single-node.

## Referencias

- RFC 8030 (Generic Event Delivery Using HTTP Push)
- RFC 8292 (VAPID for Web Push)
- RFC 8291 (Message Encryption for Web Push)
- ADR-007 (Auth rotas internas) / ADR-008 (Whitelist IP)
- ADR-048 (Intelligence Desk 360 — gera os sinais que serao notificados)
- web-push npm: https://github.com/web-push-libs/web-push
