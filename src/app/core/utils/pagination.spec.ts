import { paginate } from './pagination';

describe('paginate', () => {
  it('maneja 0 elementos (1 página, items vacío, page 1)', () => {
    const result = paginate([], 1, 10);
    expect(result).toEqual({
      items: [],
      page: 1,
      totalPages: 1,
    });
  });

  it('maneja 10 elementos con tamaño 10 (1 página)', () => {
    const items = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = paginate(items, 1, 10);
    expect(result).toEqual({
      items,
      page: 1,
      totalPages: 1,
    });
  });

  it('maneja 11 elementos con tamaño 10 (2 páginas, la página 2 tiene 1 elemento)', () => {
    const items = Array.from({ length: 11 }, (_, i) => i + 1);
    const result = paginate(items, 2, 10);
    expect(result).toEqual({
      items: [11],
      page: 2,
      totalPages: 2,
    });
  });

  it('maneja 25 elementos página 3 (elementos 21 a 25)', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const result = paginate(items, 3, 10);
    expect(result).toEqual({
      items: [21, 22, 23, 24, 25],
      page: 3,
      totalPages: 3,
    });
  });

  it('ajusta la página 99 con 25 elementos a la página 3', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const result = paginate(items, 99, 10);
    expect(result).toEqual({
      items: [21, 22, 23, 24, 25],
      page: 3,
      totalPages: 3,
    });
  });

  it('ajusta páginas menores que 1 (página 0 y -2) a la página 1', () => {
    const items = [1, 2, 3];
    expect(paginate(items, 0, 10)).toEqual({
      items: [1, 2, 3],
      page: 1,
      totalPages: 1,
    });
    expect(paginate(items, -2, 10)).toEqual({
      items: [1, 2, 3],
      page: 1,
      totalPages: 1,
    });
  });

  it('trunca páginas no enteras (página 1.7 -> 1)', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const result = paginate(items, 1.7, 10);
    expect(result).toEqual({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      page: 1,
      totalPages: 3,
    });
  });

  it('trata un pageSize menor que 1 como 1', () => {
    const items = ['a', 'b', 'c'];
    const result = paginate(items, 2, 0);
    expect(result).toEqual({
      items: ['b'],
      page: 2,
      totalPages: 3,
    });
  });
});
