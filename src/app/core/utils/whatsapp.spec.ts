import { invitationMessage, whatsappUrl } from './whatsapp';

describe('whatsapp utils', () => {
  it('builds the exact invitation message', () => {
    const msg = invitationMessage({
      groupName: 'Familia Ejemplo',
      eventName: 'Baby shower de prueba',
      dateText: 'domingo, 29 de noviembre de 2026',
      link: 'http://localhost:8100/i/ABCDEFGHJK',
    });

    expect(msg).toBe(
      'Hola, Familia Ejemplo. Están invitados a Baby shower de prueba el domingo, 29 de noviembre de 2026. Confirmen su asistencia aquí: http://localhost:8100/i/ABCDEFGHJK',
    );
  });

  it('returns encoded wa.me URL when phone is present and null when absent', () => {
    const msg = 'Hola, Familia Ejemplo.';
    expect(whatsappUrl('+573000000000', msg)).toBe(
      `https://wa.me/573000000000?text=${encodeURIComponent(msg)}`,
    );
    expect(whatsappUrl('300 000 0000', msg)).toBe(
      `https://wa.me/573000000000?text=${encodeURIComponent(msg)}`,
    );
    expect(whatsappUrl(null, msg)).toBeNull();
    expect(whatsappUrl('', msg)).toBeNull();
  });
});
