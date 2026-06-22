import { versionInfo } from '../version.js';
import { loadRuntimeLead, loadRuntimeOffers } from '../integrations/runtime-data.js';
import { fetchActiveOffersFromSupabase, fetchLeadByPhoneFromSupabase } from '../integrations/supabase-runtime-store.js';
import { shouldShareRegistrationLink, registrationLinkAction } from '../policies/registration-link-policy.js';
import { shouldRequestHumanHandoff } from '../policies/handoff-policy.js';
import { detectDestination, resolveOfferByDestination } from '../resolvers/offer-resolver.js';
const BROWSE_RE = /מה יש|מה יש לכם|מה יש לך|להציע|הכל|כל הטיולים|איזה טיולים|טיולים לחו|יעדים|אפשרויות|זה הכל|יש עוד/i;
const SHOW_ALL_RE = /הכל|כל הטיולים|כל האפשרויות|תראי לי הכל|תראה לי הכל|מה יש לכם|מה יש לך להציע/i;
const PRICE_RE = /מחיר|כמה עולה|כמה זה עולה|עלות/i;
const HANDOFF_RE = /נציג|צוות|אנושי|בן אדם|איש צוות/i;
const FRIEND_RE = /חבר|חברה|ידידה|ידיד|ביחד|לבוא עם/i;
const SOLO_RE = /לבד|סולו|solo/i;
function detectMode(messageText, offers) {
    const text = messageText.trim();
    const reasons = [];
    if (HANDOFF_RE.test(text)) {
        reasons.push('explicit_human_request');
        return { mode: 'handoff', reasons, destination: null, offer: null };
    }
    const destination = detectDestination(text, offers);
    const matchedOffer = resolveOfferByDestination(destination, offers);
    if (PRICE_RE.test(text)) {
        reasons.push('price_question_detected');
        if (matchedOffer)
            reasons.push('offer_detected_from_price_question');
        return { mode: 'price', reasons, destination, offer: matchedOffer };
    }
    if (SHOW_ALL_RE.test(text)) {
        reasons.push('show_all_detected');
        return { mode: 'browse', reasons, destination: null, offer: null };
    }
    if (BROWSE_RE.test(text)) {
        reasons.push('browse_intent_detected');
        return { mode: 'browse', reasons, destination: null, offer: null };
    }
    if (matchedOffer) {
        reasons.push('direct_offer_interest_detected');
        return { mode: 'offer', reasons, destination, offer: matchedOffer };
    }
    reasons.push('default_fallback');
    return { mode: 'generic', reasons, destination: null, offer: null };
}
function extractLeadState(runtimeLead, messageText, offers) {
    const explicitDestination = detectDestination(messageText, offers);
    return {
        firstName: runtimeLead.firstName,
        preferredDestination: explicitDestination ?? runtimeLead.preferredDestination,
        preferredTimeWindow: runtimeLead.preferredTimeWindow,
        travelCompanionState: FRIEND_RE.test(messageText)
            ? 'with_friend'
            : SOLO_RE.test(messageText)
                ? 'solo'
                : runtimeLead.travelCompanionState,
    };
}
function greetName(name) {
    return name ? `${name}, ` : '';
}
function buildBrowseReply(name, offers) {
    if (!offers.length) {
        return `${greetName(name)}כרגע אין לי הצעות פעילות שאני יכולה להציג בצורה בטוחה. אם תרצה, אעביר אותך לנציג כדי לבדוק מה צפוי להיפתח.`;
    }
    const lines = offers.map((offer, index) => {
        const pricePart = offer.price ? ` — החל מ-${offer.price}${offer.currency ?? '₪'}` : '';
        return `${index + 1}. ${offer.title}${pricePart}`;
    });
    return `${greetName(name)}כרגע אלה הטיולים הפעילים שאני יכולה להציע:
${lines.join('\n')}

אם אחד מהם מושך אותך, אני אגיד לך ישר מה הכי מתאים ואשלח לינק להרשמה.`;
}
function buildOfferReply(name, offer) {
    const summary = offer.aiSummary ? ` ${offer.aiSummary}` : '';
    const pricePart = offer.price ? ` המחיר כרגע הוא החל מ-${offer.price}${offer.currency ?? '₪'}.` : '';
    const linkPart = offer.offerUrl ? ` אם זה נשמע נכון, הנה הלינק לפרטים והרשמה: ${offer.offerUrl}` : '';
    return `${greetName(name)}כן, יש לנו את ${offer.title}.${summary}${pricePart}${linkPart}`.trim();
}
function buildPriceReply(name, offer) {
    if (!offer) {
        return `${greetName(name)}כדי לענות מדויק על מחיר, תגיד לי לאיזה טיול אתה מתכוון ואני אבדוק לך ישירות.`;
    }
    if (!offer.price) {
        return `${greetName(name)}כרגע אין לי מחיר סגור ומפורסם עבור ${offer.title}. אם תרצה, אעביר אותך לנציג שיבדוק זמינות ומחיר עדכני.`;
    }
    const linkPart = offer.offerUrl ? ` הנה גם הלינק להרשמה: ${offer.offerUrl}` : '';
    return `${greetName(name)}המחיר של ${offer.title} הוא כרגע החל מ-${offer.price}${offer.currency ?? '₪'}.${linkPart}`.trim();
}
function buildGenericReply(name, leadState, offers) {
    if (leadState.preferredDestination) {
        const matched = resolveOfferByDestination(leadState.preferredDestination, offers);
        if (matched) {
            return buildOfferReply(name, matched);
        }
    }
    return `${greetName(name)}בשמחה. אני יכולה לעזור לך למצוא את הטיול הכי מתאים ולשלוח אותך ישירות להרשמה. אם תרצה, תגיד לי איזה יעד או סוג טיול מעניין אותך.`;
}
function buildWritebacks(mode, leadState, offer) {
    return [
        {
            type: 'lead_state_upsert',
            leadStage: mode === 'handoff' ? 'human_handoff_requested' : 'active_sales_conversation',
            preferredDestination: leadState.preferredDestination,
            preferredTimeWindow: leadState.preferredTimeWindow,
            travelCompanionState: leadState.travelCompanionState,
            currentOfferId: offer?.id ?? null,
        },
    ];
}
export async function runTamarTurnEngine(input) {
    let offers = loadRuntimeOffers(input);
    if (!offers.length && process.env.RUNTIME_LOAD_OFFERS_FROM_SUPABASE === 'true') {
        offers = await fetchActiveOffersFromSupabase();
    }
    let runtimeLead = loadRuntimeLead(input);
    if (!runtimeLead.contactId && process.env.RUNTIME_LOAD_LEAD_FROM_SUPABASE === 'true') {
        const supabaseLead = await fetchLeadByPhoneFromSupabase(input.phone);
        if (supabaseLead)
            runtimeLead = supabaseLead;
    }
    const leadState = extractLeadState(runtimeLead, input.messageText, offers);
    const handoffDecision = shouldRequestHumanHandoff(input.messageText);
    const detected = detectMode(input.messageText, offers);
    const mode = handoffDecision.required ? 'handoff' : detected.mode;
    const reasons = handoffDecision.required
        ? [...detected.reasons, ...handoffDecision.reasons]
        : detected.reasons;
    const offer = detected.offer;
    const destination = detected.destination;
    let replyText;
    if (mode === 'browse') {
        replyText = buildBrowseReply(leadState.firstName, offers);
    }
    else if (mode === 'handoff') {
        replyText = `${greetName(leadState.firstName)}מעולה — אני מעבירה אותך לנציג אנושי מהצוות כדי לעזור לך לסגור את זה.`;
    }
    else if (mode === 'price') {
        replyText = buildPriceReply(leadState.firstName, offer);
    }
    else if (mode === 'offer' && offer) {
        replyText = buildOfferReply(leadState.firstName, offer);
    }
    else {
        replyText = buildGenericReply(leadState.firstName, leadState, offers);
    }
    const actions = shouldShareRegistrationLink(mode, offer)
        ? [registrationLinkAction(offer)]
        : [];
    return {
        replyText,
        mode,
        reasons,
        resolvedOfferId: offer?.id ?? null,
        actions,
        writebacks: buildWritebacks(mode, leadState, offer),
        handoff: {
            required: mode === 'handoff',
            status: mode === 'handoff' ? 'queued' : 'none',
        },
        trace: {
            engine: 'tamar-turn-engine-v1-lean-sales',
            receivedMessageText: input.messageText,
            detectedMode: mode,
            reasons,
            destination,
            leadState,
            runtimeLead,
            offersConsidered: offers.length,
            matchedOfferId: offer?.id ?? null,
            activeOfferTitles: offers.map((item) => item.title),
            handoffDecision,
            actions,
        },
        version: versionInfo(),
    };
}
