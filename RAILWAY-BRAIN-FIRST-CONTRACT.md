# Railway Brain First Contract

## Endpoint
`POST /runtime/tamar-turn`

## Purpose
Receive a normalized inbound Tamar turn and return a structured runtime decision payload.

---

## Request shape
```json
{
  "channel": "whatsapp",
  "messageId": "abc123",
  "phone": "972512345678",
  "contactId": "optional-contact-id",
  "messageText": "תראי לי הכל",
  "messageTimestamp": "2026-06-17T01:00:00Z",
  "transportMetadata": {},
  "crmSnapshot": {},
  "settingsSnapshot": {},
  "recentInteractions": [],
  "offersSnapshot": []
}
```

---

## Response shape
```json
{
  "ok": true,
  "result": {
    "replyText": "...",
    "mode": "browse",
    "reasons": ["browse_intent_detected"],
    "resolvedOfferId": null,
    "actions": [],
    "writebacks": [],
    "handoff": {
      "required": false,
      "status": "none"
    },
    "trace": {
      "engine": "tamar-turn-engine-v0"
    },
    "version": {
      "service": "community-intelligence-railway-brain",
      "runtimeVersion": "0.1.0-dev",
      "commitSha": "local-dev",
      "buildTime": "unknown",
      "environment": "development"
    }
  }
}
```

---

## Initial guarantee
The V0 contract does not yet promise correct production business behavior.
It promises:
- validated input
- explicit mode detection scaffold
- structured response contract
- version visibility
- trace scaffold

This is the base we build the real Tamar brain on.

---

## First migration priorities into this contract
1. explicit browse/show-all listing
2. count-challenge correction
3. offer resolution
4. pricing authority
5. handoff truthfulness
6. state writeback
7. trace persistence
