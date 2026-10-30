import { GuestGift } from '../models/guest';
import { paginate } from './pagination';
import {
  GUEST_GIFTS_PAGE_SIZE,
  categoryGuestGifts,
  guestGiftCategory,
  isGuestGiftSoldOut,
  myGuestGifts,
  orderGuestGiftIds,
  resolveGuestGiftFilter,
  selectableGuestGiftCounts,
  suggestionGuestGifts,
  visibleGuestGifts,
} from './guest-gift-list';

function buildGift(overrides: Partial<GuestGift> = {}): GuestGift {
  return {
    id: 'gift-1',
    name: 'Regalo de prueba',
    description: null,
    category: null,
    kind: 'unique',
    reserved_by_me: false,
    taken: false,
    remaining: null,
    full: false,
    max_reservations: null,
    ...overrides,
  };
}

describe('guest-gift-list utils', () => {
  describe('guestGiftCategory', () => {
    it('clasifica cada tipo correctamente', () => {
      expect(guestGiftCategory(buildGift({ kind: 'unique' }))).toBe('unique');
      expect(guestGiftCategory(buildGift({ kind: 'repeatable' }))).toBe('repeatable');
      expect(guestGiftCategory(buildGift({ kind: 'free' }))).toBe('repeatable');
      expect(guestGiftCategory(buildGift({ kind: 'suggestion' }))).toBeNull();
    });
  });

  describe('isGuestGiftSoldOut', () => {
    it('marca único tomado como agotado solo si no es de esta familia', () => {
      expect(isGuestGiftSoldOut(buildGift({ kind: 'unique', taken: true }))).toBe(true);
      expect(isGuestGiftSoldOut(buildGift({ kind: 'unique', taken: false }))).toBe(false);
      expect(
        isGuestGiftSoldOut(
          buildGift({ kind: 'unique', taken: true, reserved_by_me: true }),
        ),
      ).toBe(false);
    });

    it('marca repetible lleno como agotado solo si no es de esta familia', () => {
      expect(isGuestGiftSoldOut(buildGift({ kind: 'repeatable', full: true }))).toBe(true);
      expect(isGuestGiftSoldOut(buildGift({ kind: 'repeatable', full: false }))).toBe(false);
      expect(
        isGuestGiftSoldOut(
          buildGift({ kind: 'repeatable', full: true, reserved_by_me: true }),
        ),
      ).toBe(false);
    });

    it('el regalo libre nunca está agotado', () => {
      expect(isGuestGiftSoldOut(buildGift({ kind: 'free', full: true }))).toBe(false);
      expect(isGuestGiftSoldOut(buildGift({ kind: 'free', full: false }))).toBe(false);
    });
  });

  describe('myGuestGifts', () => {
    it('incluye únicos, repetibles y libres elegidos en el orden recibido', () => {
      const g1 = buildGift({ id: '1', kind: 'repeatable', reserved_by_me: true });
      const g2 = buildGift({ id: '2', kind: 'free', reserved_by_me: false });
      const g3 = buildGift({ id: '3', kind: 'free', reserved_by_me: true });
      const g4 = buildGift({ id: '4', kind: 'unique', reserved_by_me: true });

      const result = myGuestGifts([g1, g2, g3, g4]);
      expect(result.map((g) => g.id)).toEqual(['1', '3', '4']);
    });
  });

  describe('suggestionGuestGifts', () => {
    it('devuelve las sugerencias en el orden de la RPC', () => {
      const g1 = buildGift({ id: '1', kind: 'suggestion', name: 'Libro' });
      const g2 = buildGift({ id: '2', kind: 'unique', name: 'Ropa' });
      const g3 = buildGift({ id: '3', kind: 'suggestion', name: 'Juguete' });

      expect(suggestionGuestGifts([g1, g2, g3])).toEqual([g1, g3]);
    });
  });

  describe('selectableGuestGiftCounts', () => {
    it('excluye agotados, elegidos por la familia y sugerencias', () => {
      const gifts: GuestGift[] = [
        buildGift({ id: 'u1', kind: 'unique', taken: false }),
        buildGift({ id: 'u2', kind: 'unique', taken: true }),
        buildGift({ id: 'u3', kind: 'unique', reserved_by_me: true, taken: true }),
        buildGift({ id: 'r1', kind: 'repeatable', full: false }),
        buildGift({ id: 'r2', kind: 'repeatable', full: true }),
        buildGift({ id: 'r3', kind: 'repeatable', reserved_by_me: true }),
        buildGift({ id: 'f1', kind: 'free', reserved_by_me: false }),
        buildGift({ id: 'f2', kind: 'free', reserved_by_me: true }),
        buildGift({ id: 's1', kind: 'suggestion' }),
      ];

      const counts = selectableGuestGiftCounts(gifts);
      expect(counts).toEqual({
        unique: 1, // u1
        repeatable: 2, // r1 y f1
      });
    });
  });

  describe('resolveGuestGiftFilter', () => {
    it('muestra filtro y respeta preferida cuando ambas categorías tienen cards', () => {
      const gifts: GuestGift[] = [
        buildGift({ id: 'u1', kind: 'unique' }),
        buildGift({ id: 'r1', kind: 'repeatable' }),
      ];

      expect(resolveGuestGiftFilter(gifts, 'unique')).toEqual({
        active: 'unique',
        showFilter: true,
      });
      expect(resolveGuestGiftFilter(gifts, 'repeatable')).toEqual({
        active: 'repeatable',
        showFilter: true,
      });
    });

    it('sin repetibles, activa únicos y oculta filtro aunque la preferida sea repetibles', () => {
      const gifts: GuestGift[] = [buildGift({ id: 'u1', kind: 'unique' })];

      expect(resolveGuestGiftFilter(gifts, 'repeatable')).toEqual({
        active: 'unique',
        showFilter: false,
      });
    });

    it('sin únicos, activa repetibles y oculta filtro aunque la preferida sea únicos', () => {
      const gifts: GuestGift[] = [buildGift({ id: 'r1', kind: 'repeatable' })];

      expect(resolveGuestGiftFilter(gifts, 'unique')).toEqual({
        active: 'repeatable',
        showFilter: false,
      });
    });

    it('cuenta una categoría como vacía si todos sus regalos son de la familia', () => {
      const gifts: GuestGift[] = [
        buildGift({ id: 'u1', kind: 'unique', reserved_by_me: true }),
        buildGift({ id: 'r1', kind: 'repeatable', reserved_by_me: false }),
      ];

      expect(resolveGuestGiftFilter(gifts, 'unique')).toEqual({
        active: 'repeatable',
        showFilter: false,
      });
    });

    it('devuelve la preferida si ninguna categoría tiene cards', () => {
      expect(resolveGuestGiftFilter([], 'unique')).toEqual({
        active: 'unique',
        showFilter: false,
      });
      expect(resolveGuestGiftFilter([], 'repeatable')).toEqual({
        active: 'repeatable',
        showFilter: false,
      });
    });
  });

  describe('orderGuestGiftIds', () => {
    it('pone disponibles primero y agotados al final conservando el orden de la RPC', () => {
      const gifts: GuestGift[] = [
        buildGift({ id: 'u1', kind: 'unique', taken: true }),
        buildGift({ id: 'u2', kind: 'unique', taken: false }),
        buildGift({ id: 'u3', kind: 'unique', taken: false }),
        buildGift({ id: 'u4', kind: 'unique', taken: true }),
      ];

      expect(orderGuestGiftIds(gifts, 'unique')).toEqual(['u2', 'u3', 'u1', 'u4']);
    });
  });

  describe('visibleGuestGifts', () => {
    it('mantiene la posición congelada tras marcar como agotado un regalo de la mitad', () => {
      const g1 = buildGift({ id: '1', kind: 'repeatable', full: false });
      const g2 = buildGift({ id: '2', kind: 'repeatable', full: false });
      const g3 = buildGift({ id: '3', kind: 'repeatable', full: false });
      const frozen = ['1', '2', '3'];

      const updated = [
        g1,
        { ...g2, full: true },
        g3,
      ];

      const visible = visibleGuestGifts(updated, 'repeatable', frozen);
      expect(visible.map((g) => g.id)).toEqual(['1', '2', '3']);
      expect(visible[1].full).toBe(true);
    });

    it('elimina el regalo de la lista si la familia lo elige', () => {
      const g1 = buildGift({ id: '1', kind: 'unique', reserved_by_me: false });
      const g2 = buildGift({ id: '2', kind: 'unique', reserved_by_me: false });
      const frozen = ['1', '2'];

      const updated = [
        g1,
        { ...g2, reserved_by_me: true },
      ];

      const visible = visibleGuestGifts(updated, 'unique', frozen);
      expect(visible.map((g) => g.id)).toEqual(['1']);
    });

    it('agrega al final en orden RPC un regalo liberado que no estaba en frozenIds', () => {
      const g1 = buildGift({ id: '1', kind: 'unique', reserved_by_me: false });
      const g2 = buildGift({ id: '2', kind: 'unique', reserved_by_me: true });
      const g3 = buildGift({ id: '3', kind: 'unique', reserved_by_me: false });
      const frozen = ['1', '3'];

      const updated = [
        g1,
        { ...g2, reserved_by_me: false },
        g3,
      ];

      const visible = visibleGuestGifts(updated, 'unique', frozen);
      expect(visible.map((g) => g.id)).toEqual(['1', '3', '2']);
    });
  });

  describe('paginación con paginate y GUEST_GIFTS_PAGE_SIZE', () => {
    it('13 cards dan 3 páginas, la tercera con una, y retrocede de página si la card se elige', () => {
      const cards = Array.from({ length: 13 }, (_, i) =>
        buildGift({ id: `gift-${i + 1}`, kind: 'repeatable' }),
      );

      const p1 = paginate(cards, 1, GUEST_GIFTS_PAGE_SIZE);
      expect(p1.totalPages).toBe(3);
      expect(p1.items.length).toBe(6);

      const p3 = paginate(cards, 3, GUEST_GIFTS_PAGE_SIZE);
      expect(p3.page).toBe(3);
      expect(p3.items.length).toBe(1);
      expect(p3.items[0].id).toBe('gift-13');

      // Si la card 13 pasa a "Tu regalo", quedan 12 cards (2 páginas)
      const cardsWithout13 = cards.filter((g) => g.id !== 'gift-13');
      const p3After = paginate(cardsWithout13, 3, GUEST_GIFTS_PAGE_SIZE);
      expect(p3After.totalPages).toBe(2);
      expect(p3After.page).toBe(2);
      expect(p3After.items.length).toBe(6);
    });
  });
});
