# ADR-051: Cabecalhos de seguranca HTTP (OWASP A05 hardening)

- Status: Aceito
- Data: 2026-04-21
- Wave: 11

## Contexto

Apos a Wave 10 (rate-limit publico via ADR-050), a API ainda emitia respostas
sem nenhum cabecalho de seguranca. Mesmo sendo uma API JSON sem renderizacao
HTML, isso permite vetores classicos:

- **Clickjacking**: o front pode ser embutido em iframe malicioso (sem
  `X-Frame-Options` / `frame-ancestors`).
- **MIME sniffing**: navegadores podem inferir tipos errados em respostas
  manipuladas (sem `X-Content-Type-Options: nosniff`).
- **XSS reflectido**: ainda que a API retorne JSON, sem CSP qualquer eco
  de input controlado em `text/html` (404 padrao, etc.) executa script.
- **Downgrade HTTPS->HTTP**: sem HSTS, MITM em primeira conexao funciona.
- **Vazamento de Referer**: por default o navegador envia `Referer` cruzado.
- **Acesso a sensores do dispositivo**: sem `Permissions-Policy`, nada
  declara que a API nao usa camera/microfone/geolocalizacao.

OWASP Top 10 2021 trata isso em **A05 - Security Misconfiguration**
("Default headers absent from responses").

## Decisao

Implementar **plugin Fastify `onSend`** que injeta cabecalhos restritivos
em **toda** resposta (sucesso, 4xx, 5xx, e ate 429 do rate-limit).

### Cabecalhos estaticos (sempre)

| Header | Valor | Por que |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` | API JSON nao precisa carregar nada; `frame-ancestors 'none'` bloqueia clickjacking de qualquer endpoint que retorne HTML por engano. |
| `X-Content-Type-Options` | `nosniff` | Impede sniffing MIME no IE/Edge legado. |
| `X-Frame-Options` | `DENY` | Anti-clickjacking (legacy). Complementa CSP `frame-ancestors`. |
| `Referrer-Policy` | `no-referrer` | API nao deve vazar URL/token via Referer. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolamento de processo (Spectre mitigation). |
| `Cross-Origin-Resource-Policy` | `same-site` | Bloqueia inclusao cross-site da resposta. |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()` | Nega explicitamente todos os sensores que a API nao usa. |
| `X-Permitted-Cross-Domain-Policies` | `none` | Bloqueia Adobe Flash/PDF cross-domain (legacy mas barato). |

### HSTS condicional

`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
e emitido **apenas** quando a request chegou via HTTPS, detectado por:

1. `request.protocol === "https"` (TLS direto), OU
2. `x-forwarded-proto: https` (atras de proxy reverso, primeiro valor da
   lista CSV).

Razao: HSTS sob HTTP puro e ignorado pelos navegadores e seria ruido. Em
dev local (HTTP) o header simplesmente nao aparece.

`max-age` configuravel via env (default 1 ano = 31_536_000s). `0` desliga
o header mesmo sob HTTPS.

### Idempotencia

O hook so seta o header se ele ainda nao existe (`reply.hasHeader(name)`).
Permite que rotas especificas customizem CSP no futuro sem conflitar.

## Configuracao

| Var | Default | Range |
| --- | --- | --- |
| `SECURITY_HEADERS_ENABLED` | `true` | boolean |
| `SECURITY_HEADERS_HSTS_MAX_AGE_SECONDS` | `31536000` (1 ano) | 0..63072000 (2 anos) |

`SECURITY_HEADERS_ENABLED=false` = no-op completo (failure-open para
troubleshooting).

## Localizacao do codigo

- Plugin: `apps/api/src/main/plugins/security-headers-plugin.ts`
- Wiring: `apps/api/src/main/app.ts` (apos `setErrorHandler`, ANTES do
  rate-limit, para que respostas 429 tambem recebam os headers).
- Testes: `apps/api/src/main/plugins/security-headers-plugin.test.ts`
  (5 casos: cabecalhos em 200, em 5xx, HSTS so em HTTPS, HSTS desligado
  com max-age=0, no-op quando desabilitado).

## Consequencias

### Positivas

- Fecha o restante de OWASP A05 iniciado na Wave 10 (ADR-050).
- Score esperado A/A+ em scanners externos
  (https://securityheaders.com).
- Defense in depth: mesmo que uma rota acidentalmente retorne HTML
  com input refletido, CSP `default-src 'none'` impede execucao.
- Mitiga em parte A03 (Injection - XSS reflectido).

### Negativas / limitacoes

- Headers nao protegem contra ataques de logica de negocio nem injecao
  no payload JSON (continuam dependendo de validacao Zod).
- HSTS preload exige inscricao manual no chrome HSTS preload list para
  efeito completo. Ate la, primeira visita em HTTP ainda e vulneravel.
- CSP `default-src 'none'` quebrara qualquer endpoint que precise
  servir HTML real. Hoje nenhum existe; quando existir, criar overrides
  por rota.
- `Cross-Origin-Resource-Policy: same-site` impede embed da API em
  contextos third-party. Se algum widget externo precisar consumir,
  trocar para `cross-origin` para a rota especifica.

## Evolucao futura

- CSP com `report-uri` para coletar violacoes.
- HSTS preload submission apos validar producao.
- `Network Error Logging` (NEL) e `Reporting-Endpoints` para telemetria
  de erros de rede no cliente.

## Referencias

- ADR-050: rate-limit publico (Wave 10).
- ADR-007/008: token + IP whitelist em rotas internas.
- OWASP Top 10 2021 - A05 Security Misconfiguration.
- MDN Web Docs: HTTP Security Headers.
- https://securityheaders.com - scanner publico.
