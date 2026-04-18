import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { NotificationService } from "../application/notification-service.js";
import { pushSubscriptionSchema } from "../domain/notification-types.js";

const broadcastBodySchema = z.object({
  body: z.string().min(1).max(280),
  title: z.string().min(1).max(120),
  icon: z.string().url().max(2048).optional(),
  tag: z.string().min(1).max(120).optional(),
  url: z.string().url().max(2048).optional(),
  data: z.record(z.unknown()).optional(),
});

const unsubscribeBodySchema = z.object({
  endpoint: z.string().url().max(2048),
});

export class NotificationsController {
  public constructor(private readonly service: NotificationService) {}

  public getVapidPublicKey = (request: FastifyRequest, reply: FastifyReply): void => {
    const publicKey = this.service.getVapidPublicKey();

    if (publicKey.length === 0) {
      throw new AppError({
        code: "PUSH_NOT_CONFIGURED",
        message: "Push notifications VAPID key not configured",
        statusCode: 503,
      });
    }

    void reply.send(
      buildSuccessResponse(request.id, {
        publicKey,
        enabled: this.service.isEnabled(),
      }),
    );
  };

  public subscribe = (request: FastifyRequest, reply: FastifyReply): void => {
    const subscription = pushSubscriptionSchema.parse(request.body);
    const result = this.service.subscribe(subscription);
    void reply.code(201).send(
      buildSuccessResponse(request.id, {
        created: result.created,
        endpoint: subscription.endpoint,
      }),
    );
  };

  public unsubscribe = (request: FastifyRequest, reply: FastifyReply): void => {
    const { endpoint } = unsubscribeBodySchema.parse(request.body);
    const result = this.service.unsubscribe(endpoint);
    void reply.send(
      buildSuccessResponse(request.id, { removed: result.removed }),
    );
  };

  public broadcast = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const payload = broadcastBodySchema.parse(request.body);
    const result = await this.service.broadcast(payload);
    void reply.send(buildSuccessResponse(request.id, result));
  };
}
