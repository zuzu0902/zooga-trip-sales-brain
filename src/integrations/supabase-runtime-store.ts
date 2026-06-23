import type { RuntimeLead, RuntimeOffer } from './runtime-data.js';

function getBridgeConfig() {
  const baseUrl = process.env.LOVABLE_API_URL;
  const token = process.env.RUNTIME_BRIDGE_TOKEN;

  if (!baseUrl) {
    throw new Error('Missing LOVABLE_API_URL');
  }

  if (!token) {
    throw new Error('Missing RUNTIME_BRIDGE_TOKEN');
  }

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

export async function fetchLeadContextByPhone(phone: string): Promise<{
  contact: RuntimeLead;
  recentInteractions: Array<Record<string, unknown>>;
  activeOffers: RuntimeOffer[];
  runtimeFlags: Record<string, unknown>;
}> {
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

  return {
    contact: normalizeLead(payload.contact, phone),
    recentInteractions: recentInteractionsRaw.map((item) => asRecord(item)),
    activeOffers: activeOffersRaw.map(normalizeOffer).filter((offer): offer is RuntimeOffer => Boolean(offer)),
    runtimeFlags: asRecord(payload.runtime_flags ?? payload.runtimeFlags),
  };
}

export async function fetchActiveOffersFromSupabase(): Promise<RuntimeOffer[]> {
  throw new Error('Direct offer fetch is disabled. Use fetchLeadContextByPhone via Lovable bridge.');
}

export async function fetchLeadByPhoneFromSupabase(phone: string): Promise<RuntimeLead | null> {
  const context = await fetchLeadContextByPhone(phone);
  return context.contact;
}

export async function ensureContactByPhone(params: { phone: string; firstName?: string | null }): Promise<RuntimeLead> {
  const context = await fetchLeadContextByPhone(params.phone);
  return {
    ...context.contact,
    firstName: context.contact.firstName ?? params.firstName ?? null,
  };
}

export async function hasProcessedMetaMessage(_messageId: string): Promise<boolean> {
  return false;
}

export async function recordInboundMetaWebhook(_params: {
  messageId: string;
  phone: string;
  payload: Record<string, unknown>;
  status?: 'received' | 'processed' | 'skipped_duplicate' | 'failed';
}) {
  return;
}

export async function persistHandoffRequest(params: {
  contactId: string | null;
  phone: string;
  latestInboundMessage: string;
  latestOutboundMessage: string;
  resolvedOfferId?: string | null;
  reason: string;
  runtimeTrace: Record<string, unknown>;
}) {
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

  await bridgeFetch('/api/public/runtime/writeback', {
    method: 'POST',
    body: JSON.stringify({
      phone: params.phone,
      contact_id: params.contactId ?? null,
      message_id: params.messageId ?? null,
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
      trace: params.trace,
    }),
  });

  if (params.mode === 'handoff') {
    await persistHandoffRequest({
      contactId: params.contactId ?? null,
      phone: params.phone,
      latestInboundMessage: params.messageText,
      latestOutboundMessage: params.replyText,
      resolvedOfferId: params.resolvedOfferId ?? null,
      reason: 'runtime_handoff',
      runtimeTrace: params.trace,
    });
  }
}
