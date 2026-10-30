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
  giftsMineHeading(count: number): string;
  giftChosenBadge: string;
  reserveGiftConfirm(giftName: string): string;
  giftsTitle: string;
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
    giftsMineHeading: (count: number) =>
      isIndividual
        ? count === 1
          ? 'Tu regalo'
          : 'Tus regalos'
        : count === 1
          ? 'Su regalo'
          : 'Sus regalos',
    giftChosenBadge: isIndividual ? 'Tu elección' : 'Su elección',
    reserveGiftConfirm: (giftName: string) =>
      isIndividual
        ? `¿Quieres elegir ${giftName}? Nadie más sabrá que lo elegiste tú.`
        : `¿Desean elegir ${giftName}? Nadie más sabrá que lo eligieron ustedes.`,
    giftsTitle: 'Un detalle para Eloise',
    giftsIntro: isIndividual
      ? [
          'Tu compañía es el mejor regalo, así que no sientas ningún compromiso. Si te hace ilusión llevar algo, preparamos una lista con algunas ideas.',
        ]
      : [
          'Su compañía es el mejor regalo, así que no sientan ningún compromiso. Si les hace ilusión llevar algo, preparamos una lista con algunas ideas.',
        ],
    giftsAnonymityNote: isIndividual
      ? 'Lo que elijas es anónimo: ni nosotros ni los demás invitados sabremos qué regalo elegiste. La única intención de seleccionarlos es que los regalos no se repitan.'
      : 'Lo que elijan es anónimo: ni nosotros ni los demás invitados sabremos qué regalo eligieron. La única intención de seleccionarlos es que los regalos no se repitan.',
    giftReservedConfirmation: isIndividual
      ? '¡Listo! Quedó elegido. Solo tú sabes que lo elegiste.'
      : '¡Listo! Quedó elegido. Solo ustedes saben que lo eligieron.',
    entryCodeTitle: 'Código de entrada',
    entryCodeInstruction: 'Muestra este código en la entrada',
    entryCodeTip: 'Tómale una captura de pantalla para tenerlo a mano, aunque no haya señal.',
  };
}
