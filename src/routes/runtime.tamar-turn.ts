import type { FastifyInstance } from 'fastify';
import { runTamarTurnEngine } from '../engine/tamar-turn-engine.js';
import { persistRuntimeWritebacks } from '../integrations/supabase-runtime-store.js';
import { TamarTurnRequestSchema } from '../types/tamar-turn.js';

export async function tamarTurnRoute(app: FastifyInstance) {
  app.post('/runtime/tamar-turn', async (request, reply) => {
    const parsed = TamarTurnRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: 'invalid_request',
        issues: parsed.error.flatten(),
      };
    }

    const result = await runTamarTurnEngine(parsed.data);

    if (process.env.RUNTIME_WRITEBACKS_TO_SUPABASE === 'true') {
      await persistRuntimeWritebacks({
        phone: parsed.data.phone,
        contactId: parsed.data.contactId ?? null,
        messageText: parsed.data.messageText,
        replyText: result.replyText,
        mode: result.mode,
        resolvedOfferId: result.resolvedOfferId,
        writebacks: result.writebacks,
        trace: result.trace,
      });
    }

    return {
      ok: true,
      result,
    };
  });
}
