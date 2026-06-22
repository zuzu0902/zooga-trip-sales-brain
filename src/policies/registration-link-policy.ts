import type { RuntimeOffer } from '../integrations/runtime-data.js';

export function shouldShareRegistrationLink(mode: string, offer: RuntimeOffer | null): boolean {
  if (!offer?.offerUrl) return false;
  return mode === 'offer' || mode === 'price' || mode === 'close';
}

export function registrationLinkAction(offer: RuntimeOffer) {
  return {
    type: 'share_registration_link',
    offerId: offer.id,
    url: offer.offerUrl,
  };
}
