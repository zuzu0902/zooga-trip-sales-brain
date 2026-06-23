import type { RuntimeLead, RuntimeOffer } from './runtime-data.js';
import { getSupabaseAdmin } from './supabase-admin.js';

function mapOffer(row: Record<string, unknown>): RuntimeOffer {
  return {
    id: String(row.id),
    title: String(row.title ?? row.name ?? 'Untitled offer'),
    destination: typeof row.destination === 'string' ? row.destination : null,
    status: typeof row.status === 'string' ? row.status : null,
    price:
      typeof row.price === 'number'
        ? row.price
        : typeof row.base_price_per_person === 'number'
          ? row.base_price_per_person
          : null,
    currency: typeof row.currency === 'string' ? row.currency : '₪',
    offerUrl: typeof row.offer_url === 'string' ? row.offer_url : null,
    aiSummary: typeof row.ai_summary === 'string' ? row.ai_summary : null,
  };
}

function mapLead(row: Record<string, unknown>, fallbackPhone: string): RuntimeLead {
  return {
    contactId: String(row.id),
    phone: String(row.phone ?? row.whatsapp_number ?? fallbackPhone),
    firstName:
      typeof row.first_name === 'string'
        ? row.first_name
        : typeof row.name === 'string'
          ? row.name
          : null,
    preferredDestination: typeof row.preferred_destination === 'string' ? row.preferred_destination : null,
    preferredTimeWindow: typeof row.preferred_time_window === 'string' ? row.preferred_time_window : null,
    travelCompanionState: typeof row.travel_companion_state === 'string' ? row.travel_companion_state : null,
    currentOfferId: typeof row.current_offer_id === 'string' ? row.current_offer_id : null,
    leadStage: typeof row.lead_stage === 'string' ? row.lead_stage : null,
  };
}

export async function fetchActiveOffersFromSupabase(): Promise<RuntimeOffer[]> {
  const supabase: any = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('offers')
    .select('id,title,destination,status,price,base_price_per_person,currency,offer_url,ai_summary')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapOffer(row));
}

export async function fetchLeadByPhoneFromSupabase(phone: string): Promise<RuntimeLead | null> {
  const supabase: any = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('contacts')
    .select('id,phone,whatsapp_number,first_name,name,preferred_destination,preferred_time_window,travel_companion_state,current_offer_id,lead_stage')
    .or(`phone.eq.${phone},whatsapp_number.eq.${phone}`)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapLead(data as Record<string, unknown>, phone);
}

export async function ensureContactByPhone(params: { phone: string; firstName?: string | null }): Promise<RuntimeLead> {
  const existing = await fetchLeadByPhoneFromSupabase(params.phone);
  if (existing) return existing;

  const supabase: any = getSupabaseAdmin();
  const insertPayload: Record<string, unknown> = {
    phone: params.phone,
    whatsapp_number: params.phone,
    source: 'whatsapp_runtime',
    lead_stage: 'new_lead',
    status: 'new_lead',
  };

  if (params.firstName) {
    insertPayload.first_name = params.firstName;
    insertPayload.name = params.firstName;
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert(insertPayload)
    .select('id,phone,whatsapp_number,first_name,name,preferred_destination,preferred_time_window,travel_companion_state,current_offer_id,lead_stage')
    .single();

  if (error) throw error;
  return mapLead(data as Record<string, unknown>, params.phone);
}

export async function hasProcessedMetaMessage(messageId: string): Promise<boolean> {
  const supabase: any = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('id')
    .eq('source', 'meta_whatsapp_inbound')
    .eq('status', 'processed')
    .contains('payload', { meta_message_id: messageId })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export async function recordInboundMetaWebhook(params: {
  messageId: string;
  phone: string;
  payload: Record<string, unknown>;
  status?: 'received' | 'processed' | 'skipped_duplicate' | 'failed';
}) {
  const supabase: any = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_logs').insert({
    source: 'meta_whatsapp_inbound',
    status: params.status ?? 'received',
    payload: {
      meta_message_id: params.messageId,
      phone: params.phone,
      ...params.payload,
    },
  });

  if (error) throw error;
}

export async function persistHandoffRequest(params: {
  contactId: string | null;
  phone: string;
  latestInboundMessage: string;
  runtimeTrace: Record<string, unknown>;
}) {
  const supabase: any = getSupabaseAdmin();

  const payload = {
    contact_id: params.contactId,
    source: 'zooga_trip_sales_brain',
    status: 'requested',
    payload: {
      phone: params.phone,
      latest_inbound_message: params.latestInboundMessage,
      runtime_trace: params.runtimeTrace,
    },
  };

  const candidateTables = ['manager_handoffs', 'handoffs'];
  let lastError: unknown = null;

  for (const table of candidateTables) {
    const { error } = await supabase.from(table).insert(payload);
    if (!error) return;
    lastError = error;
  }

  await supabase.from('webhook_logs').insert({
    source: 'zooga_trip_sales_brain',
    status: 'handoff_requested',
    payload,
  });

  if (lastError) {
    return;
  }
}

export async function persistRuntimeWritebacks(params: {
  phone: string;
  contactId?: string | null;
  messageText: string;
  replyText: string;
  mode: string;
  resolvedOfferId?: string | null;
  writebacks: Array<Record<string, unknown>>;
  trace: Record<string, unknown>;
}) {
  const supabase: any = getSupabaseAdmin();

  const interactionPayload = {
    contact_id: params.contactId ?? null,
    type: 'whatsapp_ai_turn',
    source: 'zooga_trip_sales_brain',
    content: JSON.stringify({
      inbound: params.messageText,
      outbound: params.replyText,
      mode: params.mode,
      resolved_offer_id: params.resolvedOfferId ?? null,
    }),
    related_offer_id: params.resolvedOfferId ?? null,
    timestamp: new Date().toISOString(),
  };

  const { error: interactionError } = await supabase.from('interactions').insert(interactionPayload);
  if (interactionError) throw interactionError;

  const leadWriteback = params.writebacks.find((item) => item.type === 'lead_state_upsert');
  if (leadWriteback && params.contactId) {
    const patch: Record<string, unknown> = {};
    if (typeof leadWriteback.preferredDestination === 'string') patch.preferred_destination = leadWriteback.preferredDestination;
    if (typeof leadWriteback.preferredTimeWindow === 'string') patch.preferred_time_window = leadWriteback.preferredTimeWindow;
    if (typeof leadWriteback.travelCompanionState === 'string') patch.travel_companion_state = leadWriteback.travelCompanionState;
    if (typeof leadWriteback.currentOfferId === 'string') patch.current_offer_id = leadWriteback.currentOfferId;
    if (typeof leadWriteback.leadStage === 'string') patch.lead_stage = leadWriteback.leadStage;

    if (Object.keys(patch).length) {
      const { error: contactError } = await supabase.from('contacts').update(patch).eq('id', params.contactId);
      if (contactError) throw contactError;
    }
  }

  if (params.mode === 'handoff') {
    await persistHandoffRequest({
      contactId: params.contactId ?? null,
      phone: params.phone,
      latestInboundMessage: params.messageText,
      runtimeTrace: params.trace,
    });
  }

  const tracePayload = {
    source: 'zooga_trip_sales_brain',
    status: 'runtime_trace',
    payload: params.trace,
  };

  const { error: traceError } = await supabase.from('webhook_logs').insert(tracePayload);
  if (traceError) throw traceError;
}
