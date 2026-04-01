# BotFinanceiro

Monorepo TypeScript para um ecossistema de mercado financeiro global e cripto.

## Requisitos

1. Node.js 20+
2. NPM 10+

## Inicio rapido

1. Copie o arquivo `.env.example` para `.env`.
2. Instale dependencias com `npm install`.
3. Suba a API em modo desenvolvimento com `npm run dev:api`.

## Qualidade

1. Lint: `npm run lint`
2. Typecheck: `npm run typecheck`
3. Check completo: `npm run check`

## Estrategia de custo zero

1. Priorizar provedores gratuitos e open-source.
2. Sempre usar cache antes de chamadas externas.
3. Aplicar degradacao graciosa para evitar indisponibilidade total.

## Documentacao de decisoes

1. ADR 001: `docs/ADR/ADR-001-politica-degradacao-rate-limit.md`
2. ADR 002: `docs/ADR/ADR-002-fundacao-tecnica-monorepo-typescript.md`