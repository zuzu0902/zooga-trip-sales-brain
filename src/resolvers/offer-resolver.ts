import type { RuntimeOffer } from '../integrations/runtime-data.js';

const DESTINATION_HINTS: Record<string, string[]> = {
  'אלבניה': ['אלבניה'],
  'דובאי': ['דובאי', 'dubai'],
  'וייטנאם': ['וייטנאם', 'ויאטנם', 'viet'],
  'קמבודיה': ['קמבודיה', 'cambodia'],
  'מונטנגרו': ['מונטנגרו'],
  'רודוס': ['רודוס'],
};

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function qualifierScore(messageText: string, offer: RuntimeOffer): number {
  const text = normalize(messageText);
  const qualifierHints = (offer.meta?.qualifierHints ?? {}) as Record<string, unknown>;
  const audienceTags = Array.isArray(qualifierHints.audience_tags)
    ? qualifierHints.audience_tags.filter((item): item is string => typeof item === 'string')
    : [];
  const ageBand = typeof qualifierHints.age_band === 'string' ? qualifierHints.age_band : null;
  const ageMin = typeof qualifierHints.age_min === 'number' ? qualifierHints.age_min : offer.meta?.targetMinAge ?? null;

  let score = 0;

  if (/60\+|60 פלוס|בני 60 ומעלה|מגיל 60/.test(text)) {
    if ((ageMin ?? 0) >= 60) score += 10;
    if (ageBand?.includes('60')) score += 6;
    if (audienceTags.some((tag) => /60|מבוגרים|סניור|senior/i.test(tag))) score += 4;
    if (/60\+|60 פלוס|בני 60 ומעלה|מגיל 60/i.test(offer.title)) score += 8;
  }

  if (/45|סינגלים|פרק ב/.test(text)) {
    if (/45|סינגלים|פרק ב/i.test(offer.title)) score += 4;
  }

  return score;
}

export function detectDestination(messageText: string, offers: RuntimeOffer[]): string | null {
  const lower = normalize(messageText);

  for (const [destination, hints] of Object.entries(DESTINATION_HINTS)) {
    if (hints.some((hint) => lower.includes(hint.toLowerCase()))) {
      return destination;
    }
  }

  for (const offer of offers) {
    const titleLower = offer.title.toLowerCase();
    if (lower.includes(titleLower)) {
      return offer.destination ?? offer.title;
    }
  }

  return null;
}

export function resolveOfferByDestination(destination: string | null, offers: RuntimeOffer[], messageText?: string): RuntimeOffer | null {
  if (!destination) return null;
  const lowered = destination.toLowerCase();

  const candidates = offers.filter((offer) => (offer.destination ?? offer.title).toLowerCase().includes(lowered));
  if (!candidates.length) return null;
  if (!messageText) return candidates[0] ?? null;

  return [...candidates]
    .sort((a, b) => qualifierScore(messageText, b) - qualifierScore(messageText, a))
    [0] ?? null;
}

export function resolveOfferByPresentedIndex(input: string, offers: RuntimeOffer[], lastPresentedOffers: Array<{ index: number; offerId: string }>): RuntimeOffer | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const index = Number(trimmed);
  const selected = lastPresentedOffers.find((item) => item.index === index);
  if (!selected) return null;

  return offers.find((offer) => offer.id === selected.offerId) ?? null;
}
