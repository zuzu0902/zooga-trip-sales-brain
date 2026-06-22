const DESTINATION_HINTS = {
    'אלבניה': ['אלבניה'],
    'דובאי': ['דובאי', 'dubai'],
    'וייטנאם': ['וייטנאם', 'ויאטנם', 'viet'],
    'קמבודיה': ['קמבודיה', 'cambodia'],
    'מונטנגרו': ['מונטנגרו'],
    'רודוס': ['רודוס'],
};
export function detectDestination(messageText, offers) {
    const lower = messageText.toLowerCase();
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
export function resolveOfferByDestination(destination, offers) {
    if (!destination)
        return null;
    const lowered = destination.toLowerCase();
    return offers.find((offer) => (offer.destination ?? offer.title).toLowerCase().includes(lowered)) ?? null;
}
