import type { FastifyInstance } from 'fastify';
import { runTamarTurnEngine } from '../engine/tamar-turn-engine.js';
import {
  ensureContactByPhone,
  hasProcessedMetaMessage,
  persistRuntimeWritebacks,
  recordInboundMetaWebhook,
} from '../integrations/supabase-runtime-store.js';
import { normalizeMetaInbound, sendMetaTextMessage, verifyMetaWebhook } from '../integrations/meta-whatsapp.js';

export async function metaWebhookRoute(app: FastifyInstance) {
  app.get('/webhooks/meta', async (request, reply) => {
    const result = verifyMetaWebhook(request.query as Record<string, unknown>);
    reply.code(result.statusCode);
    return result.body;
  });

  app.post('/webhooks/meta', async (request, reply) => {
    const inboundMessages = normalizeMetaInbound(request.body);

    const processed: Array<Record<string, unknown>> = [];

    for (const inbound of inboundMessages) {
      const writebacksEnabled = process.env.RUNTIME_WRITEBACKS_TO_SUPABASE === 'true';

      if (writebacksEnabled) {
        const duplicate = await hasProcessedMetaMessage(inbound.messageId);
        if (duplicate) {
          await recordInboundMetaWebhook({
            messageId: inbound.messageId,
            phone: inbound.phone,
            status: 'skipped_duplicate',
            payload: { inbound },
          });
          processed.push({
            phone: inbound.phone,
            messageId: inbound.messageId,
            skipped: 'duplicate',
          });
          continue;
        }

        await recordInboundMetaWebhook({
          messageId: inbound.messageId,
          phone: inbound.phone,
          status: 'received',
          payload: { inbound },
        });
      }

      const ensuredLead = writebacksEnabled
        ? await ensureContactByPhone({ phone: inbound.phone })
        : null;

      const result = await runTamarTurnEngine({
        channel: inbound.channel,
        messageId: inbound.messageId,
        phone: inbound.phone,
        contactId: ensuredLead?.contactId ?? undefined,
        messageText: inbound.messageText,
        messageTimestamp: inbound.messageTimestamp,
        transportMetadata: { provider: 'meta_whatsapp' },
      });

      const sendResult = await sendMetaTextMessage({
        to: inbound.phone,
        text: result.replyText,
      });

      if (writebacksEnabled) {
        const trace = {
          ...result.trace,
          meta_delivery_response: sendResult,
          meta_message_id: inbound.messageId,
        };

        await persistRuntimeWritebacks({
          phone: inbound.phone,
          contactId: ensuredLead?.contactId ?? null,
          messageText: inbound.messageText,
          replyText: result.replyText,
          mode: result.mode,
          resolvedOfferId: result.resolvedOfferId,
          writebacks: result.writebacks,
          trace,
        });

        await recordInboundMetaWebhook({
          messageId: inbound.messageId,
          phone: inbound.phone,
          status: 'processed',
          payload: {
            inbound,
            result: {
              mode: result.mode,
              resolvedOfferId: result.resolvedOfferId,
            },
          },
        });
      }

      processed.push({
        phone: inbound.phone,
        messageId: inbound.messageId,
        mode: result.mode,
        resolvedOfferId: result.resolvedOfferId,
      });
    }

    return {
      ok: true,
      processedCount: processed.length,
      processed,
    };
  });
}
