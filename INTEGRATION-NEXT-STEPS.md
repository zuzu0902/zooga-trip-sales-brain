# Integration Next Steps

## Goal
Turn the current lean runtime starter into a live WhatsApp trip sales agent using the existing Meta API, Railway, and business data.

---

## 1. Meta integration
The new Railway service should become the webhook target for WhatsApp traffic.

### Required pieces
- Meta webhook verification route
- inbound message normalization
- outbound send helper
- delivery/status callback handling

### Recommended runtime flow
1. Meta sends inbound webhook
2. Railway normalizes payload
3. Railway loads lead + offers
4. Railway runs `runTamarTurnEngine()`
5. Railway sends outbound reply through Meta API
6. Railway stores trace + writebacks

---

## 2. Offers integration
Right now the engine expects `offersSnapshot` in the request.

### Next step
Replace that dependency with a server-side offer loader.

### Options
- read from existing Supabase offers table
- read from a simplified dedicated offers table/view
- keep a fallback request-injected snapshot only for testing

### Required output shape
- id
- title
- destination
- status
- price
- currency
- offer_url
- ai_summary (optional)

---

## 3. Lead integration
Right now the engine reads `crmSnapshot` if supplied.

### Next step
Load the lead directly by phone/contact id.

### Required lead fields
- contact id
- first name
- preferred destination
- preferred time window
- travel companion state
- current offer id
- lead stage
- last interaction summary (later)

---

## 4. Writeback integration
Current writebacks are only structured payloads returned from the engine.

### Next step
Persist them in storage.

### Minimum writes
- interaction log
- lead state update
- current offer id update
- lead stage update
- handoff requested state if relevant
- runtime trace record

---

## 5. Registration-link policy
Current behavior shares registration links when:
- direct offer path
- price path
- future close path

### Next step
Add business rules for:
- when to send link immediately
- when to wait one more turn
- when to encourage “friend bring friend”
- when to escalate instead of sending link

---

## 6. Handoff integration
Current handoff behavior only queues state in the response.

### Next step
Implement actual human alerting:
- send manager alert
- persist handoff row
- mark conversation muted if needed
- show handoff in Lovable/operator UI

---

## 7. Minimum production test set
Before routing real traffic, test these exact cases:
- generic browse: “מה יש לך להציע?”
- show all: “תראי לי את כל הטיולים”
- direct destination: “יש לכם אלבניה?”
- direct price: “כמה עולה דובאי?”
- missing price case
- solo hesitation
- friend-bring-friend signal
- explicit handoff request

---

## Final rule
The starter is now good enough to continue implementation.
The next milestone is not more architecture.
The next milestone is wiring this engine to real offers, real leads, and real Meta traffic.
