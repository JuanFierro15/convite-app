import { guestTexts, toInvitationKind } from './invitation-texts';

describe('invitation-texts utils', () => {
  describe('toInvitationKind', () => {
    it('resolves individual only when value is exactly individual', () => {
      expect(toInvitationKind('individual')).toBe('individual');
      expect(toInvitationKind('group')).toBe('group');
      expect(toInvitationKind(undefined)).toBe('group');
      expect(toInvitationKind('otro')).toBe('group');
      expect(toInvitationKind(null)).toBe('group');
    });
  });

  describe('welcomeTitle', () => {
    it('returns empty string when name is empty or whitespace', () => {
      expect(guestTexts('group', '').welcomeTitle).toBe('');
      expect(guestTexts('group', '   ').welcomeTitle).toBe('');
      expect(guestTexts('individual', '').welcomeTitle).toBe('');
    });

    it('formats group invitations starting with Familia (case-insensitive)', () => {
      expect(guestTexts('group', 'Familia Ejemplo').welcomeTitle).toBe(
        'La familia Ejemplo está invitada',
      );
      expect(guestTexts('group', 'familia ejemplo').welcomeTitle).toBe(
        'La familia ejemplo está invitada',
      );
      expect(guestTexts('group', 'FAMILIA Pérez').welcomeTitle).toBe(
        'La familia Pérez está invitada',
      );
    });

    it('formats group invitations that do not start with Familia', () => {
      expect(guestTexts('group', 'Amigos del trabajo').welcomeTitle).toBe(
        'Amigos del trabajo, queremos que nos acompañen',
      );
    });

    it('formats individual invitations', () => {
      expect(guestTexts('individual', 'Carlos').welcomeTitle).toBe(
        'Carlos, te invitamos',
      );
    });
  });

  describe('all fields for group and individual', () => {
    const testDate = '24 de noviembre';

    it('matches all fields for group', () => {
      const texts = guestTexts('group', 'Familia Ejemplo');
      expect(texts.welcomeTitle).toBe('La familia Ejemplo está invitada');
      expect(texts.deadlineReminder(testDate)).toBe('Por favor respondan antes del 24 de noviembre');
      expect(texts.deadlinePassed).toBe(
        'El plazo para responder ya terminó. Si necesitan cambiar su respuesta, escríbannos.',
      );
      expect(texts.rsvpThanks(testDate)).toBe(
        '¡Gracias! Recibimos su respuesta. Pueden cambiarla hasta el 24 de noviembre.',
      );
      expect(texts.tableNote).toBe('Su mesa se asignará pronto');
      expect(texts.giftsMineHeading).toBe('Apartados por ustedes');
      expect(texts.giftMineBadge).toBe('Apartado por ustedes');
      expect(texts.giftChosenBadge).toBe('Ustedes eligieron esta opción');
      expect(texts.reserveGiftConfirm('Pañales')).toBe(
        '¿Desean apartar Pañales a nombre de Familia Ejemplo?',
      );
      expect(texts.entryCodeTitle).toBe('Código de entrada');
      expect(texts.entryCodeInstruction).toBe('Muestra este código en la entrada');
      expect(texts.entryCodeTip).toBe(
        'Tómale una captura de pantalla para tenerlo a mano, aunque no haya señal.',
      );
    });

    it('matches all fields for individual', () => {
      const texts = guestTexts('individual', 'Carlos');
      expect(texts.welcomeTitle).toBe('Carlos, te invitamos');
      expect(texts.deadlineReminder(testDate)).toBe('Por favor responde antes del 24 de noviembre');
      expect(texts.deadlinePassed).toBe(
        'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos.',
      );
      expect(texts.rsvpThanks(testDate)).toBe(
        '¡Gracias! Recibimos tu respuesta. Puedes cambiarla hasta el 24 de noviembre.',
      );
      expect(texts.tableNote).toBe('Tu mesa se asignará pronto');
      expect(texts.giftsMineHeading).toBe('Apartados por ti');
      expect(texts.giftMineBadge).toBe('Apartado por ti');
      expect(texts.giftChosenBadge).toBe('Elegiste esta opción');
      expect(texts.reserveGiftConfirm('Pañales')).toBe('¿Quieres apartar Pañales a tu nombre?');
      expect(texts.entryCodeTitle).toBe('Código de entrada');
      expect(texts.entryCodeInstruction).toBe('Muestra este código en la entrada');
      expect(texts.entryCodeTip).toBe(
        'Tómale una captura de pantalla para tenerlo a mano, aunque no haya señal.',
      );
    });
  });
});
