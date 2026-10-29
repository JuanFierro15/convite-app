import { invitationMessage, whatsappUrl } from './whatsapp';

describe('whatsapp utils', () => {
  const eventData = {
    eventName: 'Baby Shower Eloise',
    startsAt: '2026-11-29T15:00:00-05:00',
    rsvpDeadline: '2026-11-25T04:59:59Z',
    link: 'https://convite-4v8.pages.dev/i/975B4KWFHF',
  };

  it('builds group invitation message when kind is omitted or group', () => {
    const expected =
      'Hola, familia Pérez.\n\n' +
      'Los invitamos al *Baby Shower Eloise*\n' +
      'Domingo 29 de noviembre de 2026, 3:00 p. m.\n\n' +
      'Por favor confirmen su asistencia hasta el 24 de noviembre en este enlace:\n' +
      'https://convite-4v8.pages.dev/i/975B4KWFHF';

    expect(
      invitationMessage({
        ...eventData,
        groupName: 'Familia Pérez',
      }),
    ).toBe(expected);

    expect(
      invitationMessage({
        ...eventData,
        groupName: 'Familia Pérez',
        kind: 'group',
      }),
    ).toBe(expected);
  });

  it('builds individual invitation message when kind is individual', () => {
    const expected =
      'Hola, Laura Peña.\n\n' +
      'Te invitamos al *Baby Shower Eloise*\n' +
      'Domingo 29 de noviembre de 2026, 3:00 p. m.\n\n' +
      'Por favor confirma tu asistencia hasta el 24 de noviembre en este enlace:\n' +
      'https://convite-4v8.pages.dev/i/975B4KWFHF';

    expect(
      invitationMessage({
        ...eventData,
        groupName: 'Laura Peña',
        kind: 'individual',
      }),
    ).toBe(expected);
  });

  it('greets with full name when group name does not start with familia', () => {
    const msg = invitationMessage({
      ...eventData,
      groupName: 'Los Fierro',
      kind: 'group',
    });

    expect(msg).toBe(
      'Hola, Los Fierro.\n\n' +
        'Los invitamos al *Baby Shower Eloise*\n' +
        'Domingo 29 de noviembre de 2026, 3:00 p. m.\n\n' +
        'Por favor confirmen su asistencia hasta el 24 de noviembre en este enlace:\n' +
        'https://convite-4v8.pages.dev/i/975B4KWFHF',
    );
  });

  it('returns encoded wa.me URL when phone is present and null when absent', () => {
    const msg = 'Hola, familia Ejemplo.';
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
