import { invitationMessage, whatsappUrl } from './whatsapp';

describe('whatsapp utils', () => {
  it('builds group invitation message when kind is omitted or group', () => {
    const params = {
      groupName: 'Familia Ejemplo',
      eventName: 'Baby shower de prueba',
      dateText: 'domingo, 29 de noviembre de 2026',
      link: 'http://localhost:8100/i/ABCDEFGHJK',
    };

    expect(invitationMessage(params)).toBe(
      'Hola, Familia Ejemplo. Les invitamos a Baby shower de prueba el domingo, 29 de noviembre de 2026. Confirmen su asistencia aquí: http://localhost:8100/i/ABCDEFGHJK',
    );

    expect(invitationMessage({ ...params, kind: 'group' })).toBe(
      'Hola, Familia Ejemplo. Les invitamos a Baby shower de prueba el domingo, 29 de noviembre de 2026. Confirmen su asistencia aquí: http://localhost:8100/i/ABCDEFGHJK',
    );
  });

  it('builds individual invitation message when kind is individual', () => {
    const msg = invitationMessage({
      groupName: 'Carlos',
      eventName: 'Baby shower de prueba',
      dateText: 'domingo, 29 de noviembre de 2026',
      link: 'http://localhost:8100/i/ABCDEFGHJK',
      kind: 'individual',
    });

    expect(msg).toBe(
      'Hola, Carlos. Te invitamos a Baby shower de prueba el domingo, 29 de noviembre de 2026. Confirma tu asistencia aquí: http://localhost:8100/i/ABCDEFGHJK',
    );
  });

  it('returns encoded wa.me URL when phone is present and null when absent', () => {
    const msg = 'Hola, Familia Ejemplo.';
    expect(whatsappUrl('+57 300 123 4567', msg)).toBe(
      `https://wa.me/573001234567?text=${encodeURIComponent(msg)}`,
    );
    expect(whatsappUrl('\u202A300 123 4567\u202C', msg)).toBe(
      `https://wa.me/573001234567?text=${encodeURIComponent(msg)}`,
    );
    expect(whatsappUrl(null, msg)).toBeNull();
    expect(whatsappUrl('', msg)).toBeNull();
    expect(whatsappUrl('invalido', msg)).toBeNull();
  });
});
