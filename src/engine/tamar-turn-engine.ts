import type { TamarTurnRequest, TamarTurnResponse } from '../types/tamar-turn.js';
import { versionInfo } from '../version.js';
import { loadRuntimeLead, loadRuntimeOffers, type RuntimeLead, type RuntimeOffer } from '../integrations/runtime-data.js';
import { fetchLeadContextByPhone, generateReplyViaBridge } from '../integrations/supabase-runtime-store.js';
import { shouldShareRegistrationLink, registrationLinkAction } from '../policies/registration-link-policy.js';
import { shouldRequestHumanHandoff } from '../policies/handoff-policy.js';
import { detectDestination, resolveOfferByDestination } from '../resolvers/offer-resolver.js';

const BROWSE_RE = /מה יש|מה יש לכם|מה יש לך|להציע|הכל|כל הטיולים|איזה טיולים|טיולים לחו|יעדים|אפשרויות|זה הכל|יש עוד/i;
const SHOW_ALL_RE = /הכל|כל הטיולים|כל האפשרויות|תראי לי הכל|תראה לי הכל|מה יש לכם|מה יש לך להציע/i;
const PRICE_RE = /מחיר|כמה עולה|כמה זה עולה|עלות/i;
const HANDOFF_RE = /נציג|צוות|אנושי|בן אדם|איש צוות/i;
const FRIEND_RE = /חבר|חברה|ידידה|ידיד|ביחד|לבוא עם/i;
const SOLO_RE = /לבד|סולו|solo/i;

type LeadState = {
  firstName: string | null;
  preferredDestination: string | null;
  preferredTimeWindow: string | null;
  travelCompanionState: string | null;
};

function detectMode(messageText: string, offers: RuntimeOffer[]): { mode: string; reasons: string[]; destination: string | null; offer: RuntimeOffer | null } {
  const text = messageText.trim();
  const reasons: string[] = [];

  if (HANDOFF_RE.test(text)) {
    reasons.push('explicit_human_request');
    return { mode: 'handoff', reasons, destination: null, offer: null };
  }

  const destination = detectDestination(text, offers);
  const matchedOffer = resolveOfferByDestination(destination, offers);

  if (PRICE_RE.test(text)) {
    reasons.push('price_question_detected');
    if (matchedOffer) reasons.push('offer_detected_from_price_question');
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

function extractLeadState(runtimeLead: RuntimeLead, messageText: string, offers: RuntimeOffer[]): LeadState {
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

function greetName(name: string | null): string {
  return name ? `${name}, ` : '';
}

function buildBrowseReply(name: string | null, offers: RuntimeOffer[]): string {
  if (!offers.length) {
    return `${greetName(name)}כרגע אין לי הצעות פעילות שאני יכולה להציג בצורה בטוחה. אם תרצה, אעביר אותך לנציג כדי לבדוק מה צפוי להיפתח.`;
  }

  const lines = offers.slice(0, 4).map((offer, index) => {
    const pricePart = offer.price ? ` — החל מ-${offer.price}${offer.currency ?? '₪'}` : '';
    return `${index + 1}. ${offer.title}${pricePart}`;
  });

  return `${greetName(name)}כרגע אלה כמה מהטיולים הפעילים שאני יכולה להציע:
${lines.join('\n')}

אם אחד מהם מושך אותך, אני אגיד לך ישר מה הכי מתאים ואשלח לינק להרשמה.`;
}

function buildOfferReply(name: string | null, offer: RuntimeOffer): string {
  const summary = offer.aiSummary ? ` ${offer.aiSummary}` : '';
  const pricePart = offer.price ? ` המחיר כרגע הוא החל מ-${offer.price}${offer.currency ?? '₪'}.` : '';
  const linkPart = offer.offerUrl ? ` אם זה נשמע נכון, הנה הלינק לפרטים והרשמה: ${offer.offerUrl}` : '';
  return `${greetName(name)}כן, יש לנו את ${offer.title}.${summary}${pricePart}${linkPart}`.trim();
}

function buildPriceReply(name: string | null, offer: RuntimeOffer | null): string {
  if (!offer) {
    return `${greetName(name)}כדי לענות מדויק על מחיר, תגיד לי לאיזה טיול אתה מתכוון ואני אבדוק לך ישירות.`;
  }

  if (!offer.price) {
    return `${greetName(name)}כרגע אין לי מחיר סגור ומפורסם עבור ${offer.title}. אם תרצה, אעביר אותך לנציג שיבדוק זמינות ומחיר עדכני.`;
  }

  const linkPart = offer.offerUrl ? ` הנה גם הלינק להרשמה: ${offer.offerUrl}` : '';
  return `${greetName(name)}המחיר של ${offer.title} הוא כרגע החל מ-${offer.price}${offer.currency ?? '₪'}.${linkPart}`.trim();
}

function buildGenericReply(name: string | null, leadState: LeadState, offers: RuntimeOffer[]): string {
  if (leadState.preferredDestination) {
    const matched = resolveOfferByDestination(leadState.preferredDestination, offers);
    if (matched) {
      return buildOfferReply(name, matched);
    }
  }

  return `${greetName(name)}בשמחה. אני יכולה לעזור לך למצוא את הטיול הכי מתאים ולשלוח אותך ישירות להרשמה. אם תרצה, תגיד לי איזה יעד או סוג טיול מעניין אותך.`;
}

function buildWritebacks(mode: string, leadState: LeadState, offer: RuntimeOffer | null): Array<Record<string, unknown>> {
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

function buildObjective(mode: string, offer: RuntimeOffer | null): { primary_goal: string; secondary_goal: string } {
  if (mode === 'browse') {
    return {
      primary_goal: 'Present active trips naturally and help the user focus on one relevant option.',
      secondary_goal: 'Keep momentum and ask at most one useful follow-up question.',
    };
  }

  if (mode === 'offer') {
    return {
      primary_goal: `Confirm and sell the specific trip${offer ? `: ${offer.title}` : ''}.`,
      secondary_goal: 'Build confidence and move the user toward details or registration.',
    };
  }

  if (mode === 'price') {
    return {
      primary_goal: 'Answer the pricing question directly and honestly.',
      secondary_goal: 'Keep the user moving forward without unnecessary qualification.',
    };
  }

  if (mode === 'handoff') {
    return {
      primary_goal: 'Acknowledge the handoff calmly and honestly.',
      secondary_goal: 'Do not overpromise beyond what the runtime already decided.',
    };
  }

  return {
    primary_goal: 'Help the user move toward a relevant trip choice.',
    secondary_goal: 'Sound natural and useful, not scripted.',
  };
}

function buildHardRules(mode: string, offer: RuntimeOffer | null, allowLink: boolean): string[] {
  const rules = [
    'Never invent facts.',
    'Never invent a price.',
    'If the exact price is unknown, say so clearly.',
    'Ask at most one question.',
    'Keep the reply short unless the user explicitly asked for detail.',
    'Use natural Hebrew and avoid robotic phrasing.',
    'Be warm, direct, and sales-useful.',
  ];

  if (mode !== 'handoff') {
    rules.push('Do not say you are transferring to a human right now.');
  }

  if (!allowLink) {
    rules.push('Do not include any registration or details link in this reply.');
  }

  if (mode === 'price' && !offer?.price) {
    rules.push('State clearly that there is no final published price available yet for this trip.');
  }

  return rules;
}

function buildMustInclude(mode: string, fallbackReply: string): string[] {
  if (mode === 'handoff') {
    return ['Acknowledge that a human follow-up is being handled.', 'Keep the wording calm and honest.'];
  }

  if (mode === 'price') {
    return ['Answer the price question immediately in the first sentence if the price is known.'];
  }

  if (mode === 'browse') {
    return ['Mention actual active trip options, not a generic non-answer.'];
  }

  return ['Stay consistent with the deterministic fallback reply intent.', fallbackReply];
}

function buildMustNotInclude(): string[] {
  return [
    'Do not invent unavailable destinations.',
    'Do not compare unrelated trip prices unless explicitly provided in facts.',
    'Do not sound like a customer support robot.',
  ];
}

export async function runTamarTurnEngine(input: TamarTurnRequest): Promise<TamarTurnResponse> {
  const bridgeContext = await fetchLeadContextByPhone(input.phone);

  const offers = loadRuntimeOffers({
    ...input,
    offersSnapshot: input.offersSnapshot ?? bridgeContext.activeOffers,
  });

  const runtimeLead = loadRuntimeLead({
    ...input,
    contactId: input.contactId ?? bridgeContext.contact.contactId ?? undefined,
    crmSnapshot: input.crmSnapshot ?? {
      contact_id: bridgeContext.contact.contactId,
      phone: bridgeContext.contact.phone,
      first_name: bridgeContext.contact.firstName,
      preferred_destination: bridgeContext.contact.preferredDestination,
      preferred_time_window: bridgeContext.contact.preferredTimeWindow,
      travel_companion_state: bridgeContext.contact.travelCompanionState,
      current_offer_id: bridgeContext.contact.currentOfferId,
      lead_stage: bridgeContext.contact.leadStage,
    },
    recentInteractions: input.recentInteractions ?? bridgeContext.recentInteractions,
  });

  const leadState = extractLeadState(runtimeLead, input.messageText, offers);
  const handoffDecision = shouldRequestHumanHandoff(input.messageText);
  const detected = detectMode(input.messageText, offers);

  const mode = handoffDecision.required ? 'handoff' : detected.mode;
  const reasons = handoffDecision.required
    ? [...detected.reasons, ...handoffDecision.reasons]
    : detected.reasons;
  const offer = detected.offer;
  const destination = detected.destination;

  let fallbackReply: string;
  if (mode === 'browse') {
    fallbackReply = buildBrowseReply(leadState.firstName, offers);
  } else if (mode === 'handoff') {
    fallbackReply = `${greetName(leadState.firstName)}מעולה — אני מעבירה אותך לנציג אנושי מהצוות כדי לעזור לך לסגור את זה.`;
  } else if (mode === 'price') {
    fallbackReply = buildPriceReply(leadState.firstName, offer);
  } else if (mode === 'offer' && offer) {
    fallbackReply = buildOfferReply(leadState.firstName, offer);
  } else {
    fallbackReply = buildGenericReply(leadState.firstName, leadState, offers);
  }

  const actions = shouldShareRegistrationLink(mode, offer)
    ? [registrationLinkAction(offer as RuntimeOffer)]
    : [];

  const llmReply = await generateReplyViaBridge({
    identity: {
      name: 'תמר',
      language: 'he',
      tone: 'warm_natural_direct',
      sales_intensity: 'medium',
      emoji_policy: 'few',
      verbosity: 'short',
      gender_sensitive_hebrew: true,
    },
    turn_context: {
      user_message: input.messageText,
      mode,
      contact_first_name: leadState.firstName,
      resolved_offer: offer,
      active_offers: offers.slice(0, 6),
      recent_interactions: bridgeContext.recentInteractions.slice(-6),
    },
    objective: buildObjective(mode, offer),
    hard_rules: buildHardRules(mode, offer, actions.length > 0),
    must_include: buildMustInclude(mode, fallbackReply),
    must_not_include: buildMustNotInclude(),
    fallback_reply: fallbackReply,
  });

  return {
    replyText: llmReply.replyText,
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
      bridgeRuntimeFlags: bridgeContext.runtimeFlags,
      bridgeRecentInteractionsCount: bridgeContext.recentInteractions.length,
      fallbackReply,
      llmReplyUsedFallback: llmReply.usedFallback,
      llmReplyRaw: llmReply.raw,
    },
    version: versionInfo(),
  };
}
