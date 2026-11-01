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

  describe('nuevas claves de regalos y ausencia de clave anterior de sobre', () => {
    it('devuelve el texto exacto para las 5 claves y no incluye clave por defecto de sobre', () => {
      const groupTexts = guestTexts('group', 'Familia Ejemplo');
      const indTexts = guestTexts('individual', 'Carlos');

      expect(groupTexts.giftsPageIntro).toBe(
        'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, elijan de la lista para que los regalos no se repitan.',
      );
      expect(indTexts.giftsPageIntro).toBe(
        'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, elige de la lista para que los regalos no se repitan.',
      );

      expect(groupTexts.giftsPageIntroNoList).toBe(
        'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, aquí tienen algunas ideas.',
      );
      expect(indTexts.giftsPageIntroNoList).toBe(
        'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, aquí tienes algunas ideas.',
      );

      expect(groupTexts.giftsAnonymityNote).toBe(
        'Es anónimo: ni nosotros ni los demás invitados sabremos qué eligieron.',
      );
      expect(indTexts.giftsAnonymityNote).toBe(
        'Es anónimo: ni nosotros ni los demás invitados sabremos qué elegiste.',
      );

      expect(groupTexts.giftsMoreBelow).toBe('Al final también encontrarán');
      expect(indTexts.giftsMoreBelow).toBe('Al final también encontrarás');

      expect(groupTexts.giftsBasicsTitle).toBe(
        'Básicos que nunca sobran, tráiganlos si quieren',
      );
      expect(indTexts.giftsBasicsTitle).toBe(
        'Básicos que nunca sobran, tráelos si quieres',
      );

      const legacyEnvelopeKey = ['gifts', 'Envelope', 'Default'].join('');
      expect(legacyEnvelopeKey in groupTexts).toBe(false);
      expect(legacyEnvelopeKey in indTexts).toBe(false);
    });
  });

  describe('all fields for group and individual', () => {
    const testDate = '24 de noviembre';

    it('matches all fields for group', () => {
      const texts = guestTexts('group', 'Familia Ejemplo');
      expect(texts.welcomeTitle).toBe('La familia Ejemplo está invitada');
      expect(texts.deadlineReminder(testDate)).toBe('Por favor respondan antes del 24 de noviembre');
      expect(texts.deadlinePassed).toBe(
        'El plazo para responder ya terminó. Si necesitan cambiar su respuesta, escríbannos al WhatsApp donde les llegó la invitación.',
      );
      expect(texts.rsvpThanks(testDate)).toBe(
        '¡Gracias! Recibimos su respuesta. Pueden cambiarla hasta el 24 de noviembre.',
      );
      expect(texts.rsvpThanksClosed).toBe('¡Gracias! Recibimos su respuesta.');
      expect(texts.rsvpMissing(['Ana'], testDate)).toBe(
        'Recibimos sus respuestas. Falta que responda: Ana. Pueden hacerlo hasta el 24 de noviembre.',
      );
      expect(texts.rsvpMissing(['Ana', 'Pedro'], testDate)).toBe(
        'Recibimos sus respuestas. Falta que respondan: Ana y Pedro. Pueden hacerlo hasta el 24 de noviembre.',
      );
      expect(texts.rsvpMissing(['Ana', 'Pedro', 'Luis'], testDate)).toBe(
        'Recibimos sus respuestas. Falta que respondan: Ana, Pedro y Luis. Pueden hacerlo hasta el 24 de noviembre.',
      );
      expect(texts.rsvpMissing(['Ana', '', '  ', 'Pedro'], testDate)).toBe(
        'Recibimos sus respuestas. Falta que respondan: Ana y Pedro. Pueden hacerlo hasta el 24 de noviembre.',
      );
      expect(texts.rsvpMissing([], testDate)).toBe('');
      expect(texts.rsvpMissing(['', '   '], testDate)).toBe('');
      expect(texts.rsvpAnswerLabel('accepted')).toBe('Asistirá');
      expect(texts.rsvpAnswerLabel('declined')).toBe('No asistirá');
      expect(texts.rsvpAnswerLabel('pending')).toBe('Sin respuesta');
      expect(texts.rsvpAnswerLabel('unknown')).toBe('Sin respuesta');
      expect(texts.tableNote).toBe('Su mesa se asignará pronto');
      expect(texts.giftsMineHeading(1)).toBe('Su regalo');
      expect(texts.giftsMineHeading(2)).toBe('Sus regalos');
      expect(texts.giftChosenBadge).toBe('Su elección');
      expect(texts.reserveGiftConfirm('Pañales')).toBe(
        '¿Desean elegir Pañales? Nadie más sabrá que lo eligieron ustedes.',
      );
      expect(texts.releaseGiftButton).toBe('Ya no lo llevamos');
      expect(texts.releaseGiftTitle).toBe('Dejar este regalo');
      expect(texts.releaseGiftConfirm('Pañales')).toBe(
        '¿Ya no llevarán Pañales? Quedará libre para que alguien más lo elija.',
      );
      expect(texts.releaseGiftConfirmButton).toBe('Sí, dejarlo libre');
      expect(texts.chooseGiftAriaLabel('Pañales')).toBe('Elegir este regalo: Pañales');
      expect(texts.releaseGiftAriaLabel('Pañales')).toBe('Ya no lo llevamos: Pañales');
      expect(texts.giftsTitle).toBe('Un detalle para Eloise');
      expect(texts.giftsIntro).toEqual([
        'Su compañía es el mejor regalo, así que no sientan ningún compromiso. Si les hace ilusión llevar algo, preparamos una lista con algunas ideas.',
      ]);
      expect(texts.giftsPageIntro).toBe(
        'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, elijan de la lista para que los regalos no se repitan.',
      );
      expect(texts.giftsPageIntroNoList).toBe(
        'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, aquí tienen algunas ideas.',
      );
      expect(texts.giftsAnonymityNote).toBe(
        'Es anónimo: ni nosotros ni los demás invitados sabremos qué eligieron.',
      );
      expect(texts.giftsMoreBelow).toBe('Al final también encontrarán');
      expect(texts.giftsBasicsTitle).toBe(
        'Básicos que nunca sobran, tráiganlos si quieren',
      );
      expect(texts.giftReservedConfirmation).toBe(
        '¡Listo! Quedó elegido. Solo ustedes saben que lo eligieron.',
      );
      expect(texts.entryCodeTitle).toBe('Código de entrada');
      expect(texts.entryCodeInstruction).toBe(
        'Muestren este código en la entrada. Sirve para todo el grupo.',
      );
      expect(texts.entryCodeTip).toBe(
        'Tómenle una captura de pantalla para tenerlo a mano, aunque no haya señal.',
      );
    });

    it('matches all fields for individual', () => {
      const texts = guestTexts('individual', 'Carlos');
      expect(texts.welcomeTitle).toBe('Carlos, te invitamos');
      expect(texts.deadlineReminder(testDate)).toBe('Por favor responde antes del 24 de noviembre');
      expect(texts.deadlinePassed).toBe(
        'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos al WhatsApp donde te llegó la invitación.',
      );
      expect(texts.rsvpThanks(testDate)).toBe(
        '¡Gracias! Recibimos tu respuesta. Puedes cambiarla hasta el 24 de noviembre.',
      );
      expect(texts.rsvpThanksClosed).toBe('¡Gracias! Recibimos tu respuesta.');
      expect(texts.rsvpMissing(['Ana'], testDate)).toBe('');
      expect(texts.rsvpMissing(['Ana', 'Pedro'], testDate)).toBe('');
      expect(texts.rsvpAnswerLabel('accepted')).toBe('Asistirá');
      expect(texts.rsvpAnswerLabel('declined')).toBe('No asistirá');
      expect(texts.rsvpAnswerLabel('pending')).toBe('Sin respuesta');
      expect(texts.rsvpAnswerLabel('custom')).toBe('Sin respuesta');
      expect(texts.tableNote).toBe('Tu mesa se asignará pronto');
      expect(texts.giftsMineHeading(1)).toBe('Tu regalo');
      expect(texts.giftsMineHeading(2)).toBe('Tus regalos');
      expect(texts.giftChosenBadge).toBe('Tu elección');
      expect(texts.reserveGiftConfirm('Pañales')).toBe(
        '¿Quieres elegir Pañales? Nadie más sabrá que lo elegiste tú.',
      );
      expect(texts.releaseGiftButton).toBe('Ya no lo llevo');
      expect(texts.releaseGiftTitle).toBe('Dejar este regalo');
      expect(texts.releaseGiftConfirm('Pañales')).toBe(
        '¿Ya no llevarás Pañales? Quedará libre para que alguien más lo elija.',
      );
      expect(texts.releaseGiftConfirmButton).toBe('Sí, dejarlo libre');
      expect(texts.chooseGiftAriaLabel('Pañales')).toBe('Elegir este regalo: Pañales');
      expect(texts.releaseGiftAriaLabel('Pañales')).toBe('Ya no lo llevo: Pañales');
      expect(texts.giftsTitle).toBe('Un detalle para Eloise');
      expect(texts.giftsIntro).toEqual([
        'Tu compañía es el mejor regalo, así que no sientas ningún compromiso. Si te hace ilusión llevar algo, preparamos una lista con algunas ideas.',
      ]);
      expect(texts.giftsPageIntro).toBe(
        'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, elige de la lista para que los regalos no se repitan.',
      );
      expect(texts.giftsPageIntroNoList).toBe(
        'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, aquí tienes algunas ideas.',
      );
      expect(texts.giftsAnonymityNote).toBe(
        'Es anónimo: ni nosotros ni los demás invitados sabremos qué elegiste.',
      );
      expect(texts.giftsMoreBelow).toBe('Al final también encontrarás');
      expect(texts.giftsBasicsTitle).toBe(
        'Básicos que nunca sobran, tráelos si quieres',
      );
      expect(texts.giftReservedConfirmation).toBe(
        '¡Listo! Quedó elegido. Solo tú sabes que lo elegiste.',
      );
      expect(texts.entryCodeTitle).toBe('Código de entrada');
      expect(texts.entryCodeInstruction).toBe('Muestra este código en la entrada');
      expect(texts.entryCodeTip).toBe(
        'Tómale una captura de pantalla para tenerlo a mano, aunque no haya señal.',
      );
    });

    it('does not contain the group name in any field except welcomeTitle', () => {
      const groupName = 'Familia Ejemplo';
      const texts = guestTexts('group', groupName);
      const namePart = 'Ejemplo';

      expect(texts.welcomeTitle).toContain(namePart);

      const stringKeys: Array<
        {
          [K in keyof typeof texts]: (typeof texts)[K] extends string ? K : never;
        }[keyof typeof texts]
      > = [
        'deadlinePassed',
        'rsvpThanksClosed',
        'tableNote',
        'giftChosenBadge',
        'releaseGiftButton',
        'releaseGiftTitle',
        'releaseGiftConfirmButton',
        'giftsTitle',
        'giftsPageIntro',
        'giftsPageIntroNoList',
        'giftsAnonymityNote',
        'giftsMoreBelow',
        'giftsBasicsTitle',
        'giftReservedConfirmation',
        'entryCodeTitle',
        'entryCodeInstruction',
        'entryCodeTip',
      ];
      for (const key of stringKeys) {
        expect(texts[key]).not.toContain(namePart);
      }

      for (const paragraph of texts.giftsIntro) {
        expect(paragraph).not.toContain(namePart);
      }

      expect(texts.giftsMineHeading(1)).not.toContain(namePart);
      expect(texts.giftsMineHeading(2)).not.toContain(namePart);
      expect(texts.deadlineReminder('24 de noviembre')).not.toContain(namePart);
      expect(texts.rsvpThanks('24 de noviembre')).not.toContain(namePart);
      expect(texts.rsvpMissing(['Ana'], '24 de noviembre')).not.toContain(namePart);
      expect(texts.rsvpAnswerLabel('accepted')).not.toContain(namePart);
      expect(texts.reserveGiftConfirm('Coche para bebé')).not.toContain(namePart);
      expect(texts.releaseGiftConfirm('Coche para bebé')).not.toContain(namePart);
      expect(texts.chooseGiftAriaLabel('Coche para bebé')).not.toContain(namePart);
      expect(texts.releaseGiftAriaLabel('Coche para bebé')).not.toContain(namePart);
    });
  });
});
