import type { FastifyInstance } from "fastify";

import { buildSuccessResponse } from "../shared/http/api-response.js";
import type { RegimeAlertsScannerJobRunner } from "./regime-alerts-scanner-job-runner.js";

/**
 * Rota publica de status do scanner periodico de regime alerts
 * (Wave 27 / ADR-067). Apenas leitura — exibe ultima execucao,
 * contadores cumulativos e estimativa do proximo tick. Sob rate-limit
 * publico (ADR-050).
 */
export function registerRegimeAlertsScannerRoutes(
  app: FastifyInstance,
  runner: RegimeAlertsScannerJobRunner,
): void {
  app.get("/backtesting/scanner/status", (request, reply) => {
    const status = runner.getStatus();
    void reply.send(buildSuccessResponse(request.id, status));
  });
}
