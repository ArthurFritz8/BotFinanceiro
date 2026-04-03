import type { FastifyInstance } from "fastify";

import {
  getGlobalSectorsMarketOverview,
  getGlobalSectorsSnapshot,
  getGlobalSectorsSnapshotBatch,
} from "./global-sectors-controller.js";

export function registerGlobalSectorsRoutes(app: FastifyInstance): void {
  app.get("/global-sectors/market-overview", getGlobalSectorsMarketOverview);
  app.get("/global-sectors/snapshot", getGlobalSectorsSnapshot);
  app.get("/global-sectors/snapshot/batch", getGlobalSectorsSnapshotBatch);
}