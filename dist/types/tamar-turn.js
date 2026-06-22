import { z } from 'zod';
export const TamarTurnRequestSchema = z.object({
    channel: z.string().default('whatsapp'),
    messageId: z.string().min(1),
    phone: z.string().min(5),
    contactId: z.string().optional(),
    messageText: z.string().min(1),
    messageTimestamp: z.string().optional(),
    transportMetadata: z.record(z.unknown()).optional(),
    crmSnapshot: z.record(z.unknown()).optional(),
    settingsSnapshot: z.record(z.unknown()).optional(),
    recentInteractions: z.array(z.record(z.unknown())).optional(),
    offersSnapshot: z.array(z.record(z.unknown())).optional(),
});
export const TamarTurnResponseSchema = z.object({
    replyText: z.string(),
    mode: z.string(),
    reasons: z.array(z.string()),
    resolvedOfferId: z.string().nullable(),
    actions: z.array(z.record(z.unknown())),
    writebacks: z.array(z.record(z.unknown())),
    handoff: z.object({
        required: z.boolean(),
        status: z.enum(['none', 'queued', 'notified', 'failed']),
    }),
    trace: z.record(z.unknown()),
    version: z.object({
        service: z.string(),
        runtimeVersion: z.string(),
        commitSha: z.string(),
        buildTime: z.string(),
        environment: z.string(),
    }),
});
