import { GuestGift } from '../models/guest';

export type GuestGiftCategory = 'unique' | 'repeatable';

export const GUEST_GIFTS_PAGE_SIZE = 6;

/** 'unique' para únicos; 'repeatable' para repetibles y libre; null para sugerencias. */
export function guestGiftCategory(gift: GuestGift): GuestGiftCategory | null {
  if (gift.kind === 'unique') {
    return 'unique';
  }
  if (gift.kind === 'repeatable' || gift.kind === 'free') {
    return 'repeatable';
  }
  return null;
}

/** Agotado para esta familia: único tomado por otra, o repetible lleno, y sin reserved_by_me. */
export function isGuestGiftSoldOut(gift: GuestGift): boolean {
  if (gift.reserved_by_me) {
    return false;
  }
  if (gift.kind === 'unique') {
    return gift.taken;
  }
  if (gift.kind === 'repeatable') {
    return gift.full;
  }
  return false;
}

/** Regalos con reserved_by_me (cualquier tipo), en el orden de la RPC. */
export function myGuestGifts(gifts: readonly GuestGift[]): GuestGift[] {
  return gifts.filter((gift) => gift.reserved_by_me);
}

/** Sugerencias, en el orden de la RPC. */
export function suggestionGuestGifts(gifts: readonly GuestGift[]): GuestGift[] {
  return gifts.filter((gift) => gift.kind === 'suggestion');
}

/** La lluvia de sobres del evento (como máximo una), o null. */
export function envelopeGuestGift(gifts: readonly GuestGift[]): GuestGift | null {
  return gifts.find((gift) => gift.kind === 'envelope') ?? null;
}

/** Regalos de la categoría que no eligió esta familia (disponibles y agotados), en el orden de la RPC. */
export function categoryGuestGifts(
  gifts: readonly GuestGift[],
  category: GuestGiftCategory,
): GuestGift[] {
  return gifts.filter(
    (gift) => !gift.reserved_by_me && guestGiftCategory(gift) === category,
  );
}

/** Por categoría, cuántos se pueden elegir ahora: ni agotados ni elegidos por esta familia. */
export function selectableGuestGiftCounts(
  gifts: readonly GuestGift[],
): Record<GuestGiftCategory, number> {
  let unique = 0;
  let repeatable = 0;

  for (const gift of gifts) {
    if (gift.reserved_by_me) {
      continue;
    }
    const cat = guestGiftCategory(gift);
    if (!cat) {
      continue;
    }
    if (isGuestGiftSoldOut(gift)) {
      continue;
    }
    if (cat === 'unique') {
      unique++;
    } else {
      repeatable++;
    }
  }

  return { unique, repeatable };
}

/**
 * Categoría activa y si se muestra el filtro. El filtro solo se muestra si las dos
 * categorías tienen al menos una card (categoryGuestGifts no vacío). Si la preferida
 * no tiene cards y la otra sí, se activa la otra. Si ninguna tiene, se devuelve la preferida.
 */
export function resolveGuestGiftFilter(
  gifts: readonly GuestGift[],
  preferred: GuestGiftCategory,
): { active: GuestGiftCategory; showFilter: boolean } {
  const hasUnique = categoryGuestGifts(gifts, 'unique').length > 0;
  const hasRepeatable = categoryGuestGifts(gifts, 'repeatable').length > 0;
  const showFilter = hasUnique && hasRepeatable;

  const hasPreferred = preferred === 'unique' ? hasUnique : hasRepeatable;
  const hasOther = preferred === 'unique' ? hasRepeatable : hasUnique;
  const other: GuestGiftCategory = preferred === 'unique' ? 'repeatable' : 'unique';

  let active = preferred;
  if (!hasPreferred && hasOther) {
    active = other;
  }

  return { active, showFilter };
}

/** Ids de la categoría: primero los disponibles y al final los agotados; dentro de cada grupo, orden de la RPC. */
export function orderGuestGiftIds(
  gifts: readonly GuestGift[],
  category: GuestGiftCategory,
): string[] {
  const items = categoryGuestGifts(gifts, category);
  const available: string[] = [];
  const soldOut: string[] = [];

  for (const gift of items) {
    if (isGuestGiftSoldOut(gift)) {
      soldOut.push(gift.id);
    } else {
      available.push(gift.id);
    }
  }

  return [...available, ...soldOut];
}

/**
 * Cards visibles sin reordenar: los regalos de categoryGuestGifts en el orden de frozenIds
 * (se omiten los ids que ya no están, por ejemplo uno que la familia acaba de elegir),
 * y al final, en el orden de la RPC, los que no estaban en frozenIds (por ejemplo uno recién liberado).
 */
export function visibleGuestGifts(
  gifts: readonly GuestGift[],
  category: GuestGiftCategory,
  frozenIds: readonly string[],
): GuestGift[] {
  const items = categoryGuestGifts(gifts, category);
  const giftMap = new Map<string, GuestGift>();
  for (const gift of items) {
    giftMap.set(gift.id, gift);
  }

  const result: GuestGift[] = [];
  const seen = new Set<string>();

  for (const id of frozenIds) {
    const gift = giftMap.get(id);
    if (gift) {
      result.push(gift);
      seen.add(id);
    }
  }

  for (const gift of items) {
    if (!seen.has(gift.id)) {
      result.push(gift);
    }
  }

  return result;
}
