import { getSupabaseAdmin } from './supabase-admin.js';
function mapOffer(row) {
    return {
        id: String(row.id),
        title: String(row.title ?? row.name ?? 'Untitled offer'),
        destination: typeof row.destination === 'string' ? row.destination : null,
        status: typeof row.status === 'string' ? row.status : null,
        price: typeof row.price === 'number'
            ? row.price
            : typeof row.base_price_per_person === 'number'
                ? row.base_price_per_person
                : null,
        currency: typeof row.currency === 'string' ? row.currency : '₪',
        offerUrl: typeof row.offer_url === 'string' ? row.offer_url : null,
        aiSummary: typeof row.ai_summary === 'string' ? row.ai_summary : null,
    };
}
export async function fetchActiveOffersFromSupabase() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('offers')
        .select('id,title,destination,status,price,base_price_per_person,currency,offer_url,ai_summary')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return (data ?? []).map((row) => mapOffer(row));
}
export async function fetchLeadByPhoneFromSupabase(phone) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('contacts')
        .select('id,phone,whatsapp_number,first_name,name,preferred_destination,preferred_time_window,travel_companion_state,current_offer_id,lead_stage')
        .or(`phone.eq.${phone},whatsapp_number.eq.${phone}`)
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        return null;
    const row = data;
    return {
        contactId: String(row.id),
        phone: String(row.phone ?? row.whatsapp_number ?? phone),
        firstName: typeof row.first_name === 'string'
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
export async function persistRuntimeWritebacks(params) {
    const supabase = getSupabaseAdmin();
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
    if (interactionError)
        throw interactionError;
    const leadWriteback = params.writebacks.find((item) => item.type === 'lead_state_upsert');
    if (leadWriteback && params.contactId) {
        const patch = {};
        if (typeof leadWriteback.preferredDestination === 'string')
            patch.preferred_destination = leadWriteback.preferredDestination;
        if (typeof leadWriteback.preferredTimeWindow === 'string')
            patch.preferred_time_window = leadWriteback.preferredTimeWindow;
        if (typeof leadWriteback.travelCompanionState === 'string')
            patch.travel_companion_state = leadWriteback.travelCompanionState;
        if (typeof leadWriteback.currentOfferId === 'string')
            patch.current_offer_id = leadWriteback.currentOfferId;
        if (typeof leadWriteback.leadStage === 'string')
            patch.lead_stage = leadWriteback.leadStage;
        if (Object.keys(patch).length) {
            const { error: contactError } = await supabase.from('contacts').update(patch).eq('id', params.contactId);
            if (contactError)
                throw contactError;
        }
    }
    const tracePayload = {
        source: 'zooga_trip_sales_brain',
        status: 'runtime_trace',
        payload: params.trace,
    };
    const { error: traceError } = await supabase.from('webhook_logs').insert(tracePayload);
    if (traceError)
        throw traceError;
}
