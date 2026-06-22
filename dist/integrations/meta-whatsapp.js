export function verifyMetaWebhook(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const expected = process.env.META_VERIFY_TOKEN;
    if (mode !== 'subscribe') {
        return { ok: false, statusCode: 400, body: 'invalid_mode' };
    }
    if (!expected || token !== expected) {
        return { ok: false, statusCode: 403, body: 'forbidden' };
    }
    return { ok: true, statusCode: 200, body: challenge ?? 'ok' };
}
function extractMessages(body) {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const all = [];
    for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
            const value = change?.value;
            const messages = Array.isArray(value?.messages) ? value.messages : [];
            for (const message of messages) {
                all.push(message);
            }
        }
    }
    return all;
}
export function normalizeMetaInbound(body) {
    const messages = extractMessages(body);
    return messages
        .filter((message) => message?.from && message?.id)
        .map((message) => ({
        channel: 'whatsapp',
        phone: String(message.from),
        messageId: String(message.id),
        messageText: String(message.text?.body ?? '').trim(),
        messageTimestamp: message.timestamp ? String(message.timestamp) : undefined,
        raw: message,
    }))
        .filter((message) => message.messageText.length > 0);
}
export async function sendMetaTextMessage(params) {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) {
        throw new Error('Missing META_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    }
    const response = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: params.to,
            type: 'text',
            text: { body: params.text },
        }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(`Meta send failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
}
