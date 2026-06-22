# Meta Integration Notes

## What was added
The starter now includes a basic Meta WhatsApp webhook path.

## Files added
- `src/integrations/meta-whatsapp.ts`
- `src/routes/meta.webhook.ts`

## Endpoints
### Verify webhook
`GET /webhooks/meta`

Uses:
- `META_VERIFY_TOKEN`

### Receive inbound webhook
`POST /webhooks/meta`

Current behavior:
1. normalize inbound WhatsApp text messages
2. call `runTamarTurnEngine()` for each inbound message
3. send outbound reply through Meta API
4. optionally persist writebacks/traces to Supabase

## Required envs
- `META_VERIFY_TOKEN`
- `META_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

## Current limitations
This is a pragmatic first live-path scaffold.
It does not yet include:
- voice message transcription
- advanced message type handling
- delivery status callbacks
- duplicate message prevention
- retry/backoff strategy
- safe idempotency layer
- contact creation if contact does not exist

## Immediate next hardening steps
1. add idempotency guard by Meta message id
2. add contact creation when no lead exists
3. add delivery status callback route
4. add structured Meta payload logging
5. add voice-message support via transcription
6. improve closing logic and objection handling

## What this means
The new runtime is no longer only an internal turn engine.
It now has the first end-to-end Meta webhook shape:
Meta inbound -> normalize -> brain -> Meta outbound -> optional Supabase writeback
