import { joinSpanishNames, normalizeSearchText } from './text';

describe('text utils', () => {
  it('removes accents and diacritics', () => {
    expect(normalizeSearchText('Árbol canción música público')).toBe(
      'arbol cancion musica publico',
    );
  });

  it('normalizes eñe to n', () => {
    expect(normalizeSearchText('Niño')).toBe('nino');
    expect(normalizeSearchText('ACOMPAÑANTE')).toBe('acompanante');
    expect(normalizeSearchText('año')).toBe('ano');
  });

  it('converts uppercase to lowercase', () => {
    expect(normalizeSearchText('HOLA MUNDO')).toBe('hola mundo');
    expect(normalizeSearchText('FAMILIA EJEMPLO')).toBe('familia ejemplo');
  });

  it('preserves already normalized text', () => {
    expect(normalizeSearchText('convite')).toBe('convite');
    expect(normalizeSearchText('evento 2026')).toBe('evento 2026');
  });

  describe('joinSpanishNames', () => {
    it('returns empty string with 0 names or only empty/whitespace names', () => {
      expect(joinSpanishNames([])).toBe('');
      expect(joinSpanishNames(['', '   '])).toBe('');
    });

    it('formats 1 name', () => {
      expect(joinSpanishNames(['Ana'])).toBe('Ana');
      expect(joinSpanishNames(['  Ana  '])).toBe('Ana');
    });

    it('formats 2 names joined with y', () => {
      expect(joinSpanishNames(['Ana', 'Pedro'])).toBe('Ana y Pedro');
      expect(joinSpanishNames([' Ana ', ' Pedro '])).toBe('Ana y Pedro');
    });

    it('formats 3 names with comma and y', () => {
      expect(joinSpanishNames(['Ana', 'Pedro', 'Luis'])).toBe('Ana, Pedro y Luis');
    });

    it('formats 4 names with commas and y', () => {
      expect(joinSpanishNames(['Ana', 'Pedro', 'Luis', 'María'])).toBe(
        'Ana, Pedro, Luis y María',
      );
    });

    it('ignores empty and whitespace names among valid names', () => {
      expect(joinSpanishNames(['Ana', '', '  ', 'Pedro'])).toBe('Ana y Pedro');
      expect(joinSpanishNames(['', 'Ana', '   ', 'Pedro', 'Luis', ''])).toBe(
        'Ana, Pedro y Luis',
      );
    });
  });
});

