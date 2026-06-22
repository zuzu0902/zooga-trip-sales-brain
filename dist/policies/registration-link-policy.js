export function shouldShareRegistrationLink(mode, offer) {
    if (!offer?.offerUrl)
        return false;
    return mode === 'offer' || mode === 'price' || mode === 'close';
}
export function registrationLinkAction(offer) {
    return {
        type: 'share_registration_link',
        offerId: offer.id,
        url: offer.offerUrl,
    };
}
