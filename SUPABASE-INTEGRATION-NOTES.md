# Supabase Integration Notes

## What was added
The starter runtime now includes optional Supabase-backed behavior behind environment flags.

## Files added
- `src/integrations/supabase-admin.ts`
- `src/integrations/supabase-runtime-store.ts`

## What it can do now
### 1. Load active offers from Supabase
If `RUNTIME_LOAD_OFFERS_FROM_SUPABASE=true` and no `offersSnapshot` is supplied in the request, the runtime will query:
- `offers`

Expected fields:
- `id`
- `title`
- `destination`
- `status`
- `price` or `base_price_per_person`
- `currency`
- `offer_url`
- `ai_summary`

### 2. Load a lead/contact by phone
If `RUNTIME_LOAD_LEAD_FROM_SUPABASE=true` and the runtime does not already know `contactId`, it will query:
- `contacts`

Expected fields:
- `id`
- `phone`
- `whatsapp_number`
- `first_name` or `name`
- `preferred_destination`
- `preferred_time_window`
- `travel_companion_state`
- `current_offer_id`
- `lead_stage`

### 3. Persist writebacks
If `RUNTIME_WRITEBACKS_TO_SUPABASE=true`, the runtime route will persist:
- an interaction row into `interactions`
- a contact patch into `contacts` (when contact id is known)
- a trace row into `webhook_logs`

## Important note
This is a pragmatic first integration layer, not a final production data abstraction.
It is enough to begin wiring the runtime to real business data.

## Next hardening steps
- normalize phone matching more carefully
- use dedicated trace table instead of generic `webhook_logs` if preferred
- add safer interaction content shape
- persist handoff rows into a dedicated handoff table
- support contact creation when no matching contact exists
