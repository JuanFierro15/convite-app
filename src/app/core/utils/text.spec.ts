import { normalizeSearchText } from './text';

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
});
