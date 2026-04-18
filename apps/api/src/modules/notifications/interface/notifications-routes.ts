import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

import { assertInternalRouteAuth } from "../../../shared/http/internal-route-auth.js";
import type { NotificationsController } from "./notifications-controller.js";

const internalRouteOptions = {
  preHandler: (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    try {
      assertInternalRouteAuth(request);
      done();
    } catch (error) {
      done(error as Error);
    }
  },
};

export function registerNotificationsPublicRoutes(
  app: FastifyInstance,
  controller: NotificationsController,
): void {
  app.get("/notifications/vapid-public-key", controller.getVapidPublicKey);
  app.post("/notifications/subscribe", controller.subscribe);
  app.post("/notifications/unsubscribe", controller.unsubscribe);
}

export function registerNotificationsInternalRoutes(
  app: FastifyInstance,
  controller: NotificationsController,
): void {
  app.post(
    "/internal/notifications/broadcast",
    internalRouteOptions,
    controller.broadcast,
  );
}
