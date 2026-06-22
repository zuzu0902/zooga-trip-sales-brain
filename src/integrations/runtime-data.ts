import type { TamarTurnRequest } from '../types/tamar-turn.js';

export type RuntimeOffer = {
  id: string;
  title: string;
  destination: string | null;
  status: string | null;
  price: number | null;
  currency: string | null;
  offerUrl: string | null;
  aiSummary: string | null;
};

export type RuntimeLead = {
  contactId: string | null;
  phone: string;
  firstName: string | null;
  preferredDestination: string | null;
  preferredTimeWindow: string | null;
  travelCompanionState: string | null;
  currentOfferId: string | null;
  leadStage: string | null;
};

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

export function loadRuntimeOffers(input: TamarTurnRequest): RuntimeOffer[] {
  return (input.offersSnapshot ?? [])
    .map(normalizeOffer)
    .filter((offer): offer is RuntimeOffer => Boolean(offer))
    .filter((offer) => !offer.status || offer.status === 'active');
}

export function loadRuntimeLead(input: TamarTurnRequest): RuntimeLead {
  const crm = asRecord(input.crmSnapshot);

  return {
    contactId: input.contactId ?? asString(crm.contact_id) ?? asString(crm.contactId),
    phone: input.phone,
    firstName: asString(crm.first_name) ?? asString(crm.firstName) ?? asString(crm.name),
    preferredDestination: asString(crm.preferred_destination) ?? asString(crm.preferredDestination),
    preferredTimeWindow: asString(crm.preferred_time_window) ?? asString(crm.preferredTimeWindow),
    travelCompanionState: asString(crm.travel_companion_state) ?? asString(crm.travelCompanionState),
    currentOfferId: asString(crm.current_offer_id) ?? asString(crm.currentOfferId),
    leadStage: asString(crm.lead_stage) ?? asString(crm.leadStage),
  };
}
