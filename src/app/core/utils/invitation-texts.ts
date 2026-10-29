export type InvitationKind = 'group' | 'individual';

export function toInvitationKind(value: unknown): InvitationKind {
  return value === 'individual' ? 'individual' : 'group';
}

export interface GuestTexts {
  welcomeTitle: string;
  deadlineReminder(date: string): string;
  deadlinePassed: string;
  rsvpThanks(date: string): string;
  tableNote: string;
  giftsMineHeading: string;
  giftMineBadge: string;
  giftChosenBadge: string;
  reserveGiftConfirm(giftName: string): string;
  giftsIntro: readonly string[];
  giftsAnonymityNote: string;
  giftReservedConfirmation: string;
  entryCodeTitle: string;
  entryCodeInstruction: string;
  entryCodeTip: string;
}

function resolveWelcomeTitle(kind: InvitationKind, groupName: string): string {
  const trimmed = groupName.trim();
  if (trimmed === '') {
    return '';
  }

  if (kind === 'individual') {
    return `${trimmed}, te invitamos`;
  }

  const match = trimmed.match(/^familia\s+(.+)$/i);
  if (match) {
    return `La familia ${match[1].trim()} está invitada`;
  }

  return `${trimmed}, queremos que nos acompañen`;
}

export function guestTexts(kind: InvitationKind, groupName: string): GuestTexts {
  const isIndividual = kind === 'individual';

  return {
    welcomeTitle: resolveWelcomeTitle(kind, groupName),
    deadlineReminder: (date: string) =>
      isIndividual
        ? `Por favor responde antes del ${date}`
        : `Por favor respondan antes del ${date}`,
    deadlinePassed: isIndividual
      ? 'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos.'
      : 'El plazo para responder ya terminó. Si necesitan cambiar su respuesta, escríbannos.',
    rsvpThanks: (date: string) =>
      isIndividual
        ? `¡Gracias! Recibimos tu respuesta. Puedes cambiarla hasta el ${date}.`
        : `¡Gracias! Recibimos su respuesta. Pueden cambiarla hasta el ${date}.`,
    tableNote: isIndividual ? 'Tu mesa se asignará pronto' : 'Su mesa se asignará pronto',
    giftsMineHeading: isIndividual ? 'Apartados por ti' : 'Apartados por ustedes',
    giftMineBadge: isIndividual ? 'Apartado por ti' : 'Apartado por ustedes',
    giftChosenBadge: isIndividual ? 'Elegiste esta opción' : 'Ustedes eligieron esta opción',
    reserveGiftConfirm: (giftName: string) =>
      isIndividual
        ? `¿Quieres apartar ${giftName}? Nadie más sabrá que lo elegiste tú.`
        : `¿Desean apartar ${giftName}? Nadie más sabrá que lo eligieron ustedes.`,
    giftsIntro: isIndividual
      ? [
          'Para nosotros, el mejor regalo es tu compañía y compartir juntos esta tarde, así que por favor no sientas ningún compromiso de llevar algo adicional.',
          'Si de todas formas te hace ilusión tener un detalle con Eloise, preparamos la siguiente lista con algunas ideas.',
        ]
      : [
          'Para nosotros, el mejor regalo es su compañía y compartir juntos esta tarde, así que por favor no sientan ningún compromiso de llevar algo adicional.',
          'Si de todas formas les hace ilusión tener un detalle con Eloise, preparamos la siguiente lista con algunas ideas.',
        ],
    giftsAnonymityNote: isIndividual
      ? 'Lo que apartes es anónimo: ni nosotros ni los demás invitados sabremos qué regalo elegiste.'
      : 'Lo que aparten es anónimo: ni nosotros ni los demás invitados sabremos qué regalo eligieron.',
    giftReservedConfirmation: isIndividual
      ? '¡Listo! Quedó apartado. Solo tú sabes que lo elegiste.'
      : '¡Listo! Quedó apartado. Solo ustedes saben que lo eligieron.',
    entryCodeTitle: 'Código de entrada',
    entryCodeInstruction: 'Muestra este código en la entrada',
    entryCodeTip: 'Tómale una captura de pantalla para tenerlo a mano, aunque no haya señal.',
  };
}
