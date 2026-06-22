import { runTamarTurnEngine } from '../engine/tamar-turn-engine.js';
import { persistRuntimeWritebacks } from '../integrations/supabase-runtime-store.js';
import { normalizeMetaInbound, sendMetaTextMessage, verifyMetaWebhook } from '../integrations/meta-whatsapp.js';
export async function metaWebhookRoute(app) {
    app.get('/webhooks/meta', async (request, reply) => {
        const result = verifyMetaWebhook(request.query);
        reply.code(result.statusCode);
        return result.body;
    });
    app.post('/webhooks/meta', async (request, reply) => {
        const inboundMessages = normalizeMetaInbound(request.body);
        const processed = [];
        for (const inbound of inboundMessages) {
            const result = await runTamarTurnEngine({
                channel: inbound.channel,
                messageId: inbound.messageId,
                phone: inbound.phone,
                messageText: inbound.messageText,
                messageTimestamp: inbound.messageTimestamp,
                transportMetadata: { provider: 'meta_whatsapp' },
            });
            const sendResult = await sendMetaTextMessage({
                to: inbound.phone,
                text: result.replyText,
            });
            if (process.env.RUNTIME_WRITEBACKS_TO_SUPABASE === 'true') {
                await persistRuntimeWritebacks({
                    phone: inbound.phone,
                    messageText: inbound.messageText,
                    replyText: result.replyText,
                    mode: result.mode,
                    resolvedOfferId: result.resolvedOfferId,
                    writebacks: result.writebacks,
                    trace: {
                        ...result.trace,
                        meta_delivery_response: sendResult,
                        meta_message_id: inbound.messageId,
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
