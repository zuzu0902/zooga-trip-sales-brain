import type { RuntimeLead, RuntimeOffer } from './runtime-data.js';

export type LastPresentedOffer = {
  index: number;
  offerId: string;
  title?: string | null;
};

export type BridgeLeadContext = {
  contact: RuntimeLead;
  recentInteractions: Array<Record<string, unknown>>;
  activeOffers: RuntimeOffer[];
  runtimeFlags: Record<string, unknown>;
  conversationMemory: {
    lastPresentedOffers: LastPresentedOffer[];
    lastPresentedAt: string | null;
  };
};

function getBridgeConfig() {
  const baseUrl = process.env.LOVABLE_API_URL;
  const token = process.env.RUNTIME_BRIDGE_TOKEN;

  if (!baseUrl) throw new Error('Missing LOVABLE_API_URL');
  if (!token) throw new Error('Missing RUNTIME_BRIDGE_TOKEN');

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    token,
  };
}

async function bridgeFetch(path: string, init?: RequestInit) {
  const { baseUrl, token } = getBridgeConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Lovable bridge failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[, ]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function normalizeOffer(raw: unknown): RuntimeOffer | null {
  const record = asRecord(raw);
  const id = asString(record.id) ?? asString(record.offer_id);
  const title = asString(record.title) ?? asString(record.offer_title) ?? asString(record.name);
  if (!id || !title) return null;

  return {
    id,
    title,
    destination: asString(record.destination),
    status: asString(record.status),
    price: asNumber(record.price) ?? asNumber(record.base_price_per_person),
    currency: asString(record.currency) ?? '₪',
    offerUrl: asString(record.offer_url) ?? asString(record.offerUrl) ?? asString(record.url),
    aiSummary: asString(record.ai_summary) ?? asString(record.aiSummary),
    meta: {
      description: asString(record.description),
      salesAngle: asString(record.sales_angle) ?? asString(record.salesAngle),
      targetMinAge: asNumber(record.target_min_age),
      targetMaxAge: asNumber(record.target_max_age),
      targetInterests: asStringArray(record.target_interests),
      targetSpendingProfile: asString(record.target_spending_profile),
      eventEndDate: asString(record.event_end_date),
      flightsIncluded: typeof record.flights_included === 'boolean' ? record.flights_included : null,
      qualifierHints: asRecord(record.qualifier_hints),
      matchingTags: asStringArray(record.matching_tags),
    },
  };
}

function normalizeLead(raw: unknown, fallbackPhone: string): RuntimeLead {
  const record = asRecord(raw);
  return {
    contactId: asString(record.id) ?? asString(record.contact_id),
    phone: asString(record.phone) ?? asString(record.whatsapp_number) ?? fallbackPhone,
    firstName: asString(record.first_name) ?? asString(record.firstName) ?? asString(record.name),
    preferredDestination: asString(record.preferred_destination) ?? asString(record.preferredDestination),
    preferredTimeWindow: asString(record.preferred_time_window) ?? asString(record.preferredTimeWindow),
    travelCompanionState: asString(record.travel_companion_state) ?? asString(record.travelCompanionState),
    currentOfferId: asString(record.current_offer_id) ?? asString(record.currentOfferId),
    leadStage: asString(record.lead_stage) ?? asString(record.intake_stage) ?? asString(record.leadStage),
  };
}

function normalizeLastPresentedOffers(raw: unknown): LastPresentedOffer[] {
  if (!Array.isArray(raw)) return [];

  const result: LastPresentedOffer[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const index = asNumber(record.index);
    const offerId = asString(record.offer_id) ?? asString(record.offerId);
    if (!index || !offerId) continue;

    result.push({
      index,
      offerId,
      title: asString(record.title) ?? null,
    });
  }

  return result;
}

export async function fetchLeadContextByPhone(phone: string): Promise<BridgeLeadContext> {
  const payload = await bridgeFetch('/api/public/runtime/lead-context', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

  const recentInteractionsRaw = Array.isArray(payload.recent_interactions)
    ? payload.recent_interactions
    : Array.isArray(payload.recentInteractions)
      ? payload.recentInteractions
      : [];
  const activeOffersRaw = Array.isArray(payload.active_offers)
    ? payload.active_offers
    : Array.isArray(payload.activeOffers)
      ? payload.activeOffers
      : [];
  const conversationMemory = asRecord(payload.conversation_memory ?? payload.conversationMemory);

  return {
    contact: normalizeLead(payload.contact, phone),
    recentInteractions: recentInteractionsRaw.map((item) => asRecord(item)),
    activeOffers: activeOffersRaw.map(normalizeOffer).filter((offer): offer is RuntimeOffer => Boolean(offer)),
    runtimeFlags: asRecord(payload.runtime_flags ?? payload.runtimeFlags),
    conversationMemory: {
      lastPresentedOffers: normalizeLastPresentedOffers(conversationMemory.last_presented_offers),
      lastPresentedAt: asString(conversationMemory.last_presented_offers_at),
    },
  };
}

export async function generateReplyViaBridge(payload: {
  identity: Record<string, unknown>;
  turn_context: Record<string, unknown>;
  objective: Record<string, unknown>;
  hard_rules: string[];
  must_include?: string[];
  must_not_include?: string[];
  fallback_reply: string;
  inbound_message_id?: string;
}): Promise<{ replyText: string; usedFallback: boolean; raw: Record<string, unknown> }> {
  const result = await bridgeFetch('/api/public/runtime/generate-reply', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const replyText = asString(result.reply_text) ?? payload.fallback_reply;
  const usedFallback = Boolean(result.used_fallback) || replyText === payload.fallback_reply;

  return { replyText, usedFallback, raw: result };
}

export async function persistHandoffRequest(params: {
  contactId: string | null;
  phone: string;
  latestInboundMessage: string;
  latestOutboundMessage: string;
  resolvedOfferId?: string | null;
  reason: string;
  runtimeTrace: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  return bridgeFetch('/api/public/runtime/handoff', {
    method: 'POST',
    body: JSON.stringify({
      phone: params.phone,
      contact_id: params.contactId ?? null,
      reason: params.reason,
      latest_inbound_message: params.latestInboundMessage,
      latest_outbound_message: params.latestOutboundMessage,
      resolved_offer_id: params.resolvedOfferId ?? null,
      trace: params.runtimeTrace,
    }),
  });
}

export async function persistRuntimeWritebacks(params: {
  phone: string;
  contactId?: string | null;
  messageId?: string | null;
  messageText: string;
  replyText: string;
  mode: string;
  resolvedOfferId?: string | null;
  writebacks: Array<Record<string, unknown>>;
  trace: Record<string, unknown>;
}) {
  const leadWriteback = params.writebacks.find((item) => item.type === 'lead_state_upsert') ?? {};
  const presentedOffers = params.writebacks.find((item) => item.type === 'last_presented_offers_memory');

  await bridgeFetch('/api/public/runtime/writeback', {
    method: 'POST',
    body: JSON.stringify({
      phone: params.phone,
      contact_id: params.contactId ?? null,
      message_id: params.messageId ?? null,
      inbound_message_id: params.messageId ?? null,
      inbound_text: params.messageText,
      outbound_text: params.replyText,
      mode: params.mode,
      resolved_offer_id: params.resolvedOfferId ?? null,
      lead_updates: {
        preferred_destination: (leadWriteback as Record<string, unknown>).preferredDestination ?? null,
        preferred_time_window: (leadWriteback as Record<string, unknown>).preferredTimeWindow ?? null,
        travel_companion_state: (leadWriteback as Record<string, unknown>).travelCompanionState ?? null,
        current_offer_id: (leadWriteback as Record<string, unknown>).currentOfferId ?? null,
        lead_stage: (leadWriteback as Record<string, unknown>).leadStage ?? null,
      },
      last_presented_offers: Array.isArray((presentedOffers as Record<string, unknown> | undefined)?.items)
        ? (presentedOffers as Record<string, unknown>).items
        : undefined,
      trace: params.trace,
    }),
  });
}

