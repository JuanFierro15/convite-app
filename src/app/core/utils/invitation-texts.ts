import { joinSpanishNames } from './text';

export type InvitationKind = 'group' | 'individual';

export const GUEST_LOADING_TEXT = 'Cargando la invitación…';
export const GUEST_INVALID_TITLE = 'No encontramos esta invitación';
export const GUEST_LOAD_ERROR_TITLE = 'No pudimos cargar la invitación';

export function toInvitationKind(value: unknown): InvitationKind {
  return value === 'individual' ? 'individual' : 'group';
}

export interface GuestTexts {
  welcomeTitle: string;
  deadlineReminder(date: string): string;
  deadlinePassed: string;
  rsvpThanks(date: string): string;
  rsvpThanksClosed: string;
  rsvpMissing(names: readonly string[], date: string): string;
  rsvpAnswerLabel(rsvp: 'accepted' | 'declined' | 'pending' | string): string;
  tableNote: string;
  giftsMineHeading(count: number): string;
  giftChosenBadge: string;
  reserveGiftConfirm(giftName: string): string;
  releaseGiftButton: string;
  releaseGiftTitle: string;
  releaseGiftConfirm(giftName: string): string;
  releaseGiftConfirmButton: string;
  chooseGiftAriaLabel(giftName: string): string;
  releaseGiftAriaLabel(giftName: string): string;
  giftsTitle: string;
  giftsIntro: readonly string[];
  giftsPageIntro: string;
  giftsPageIntroNoList: string;
  giftsPageIntroClosed: string;
  giftsPageIntroSoldOut: string;
  giftsPageIntroSoldOutNoExtras: string;
  giftsCardClosed: string;
  giftsAnonymityNote: string;
  giftsMoreBelow: string;
  giftsBasicsTitle: string;
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
      ? 'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos al WhatsApp donde te llegó la invitación.'
      : 'El plazo para responder ya terminó. Si necesitan cambiar su respuesta, escríbannos al WhatsApp donde les llegó la invitación.',
    rsvpThanks: (date: string) =>
      isIndividual
        ? `¡Gracias! Recibimos tu respuesta. Puedes cambiarla hasta el ${date}.`
        : `¡Gracias! Recibimos su respuesta. Pueden cambiarla hasta el ${date}.`,
    rsvpThanksClosed: isIndividual
      ? '¡Gracias! Recibimos tu respuesta.'
      : '¡Gracias! Recibimos su respuesta.',
    rsvpMissing: (names: readonly string[], date: string) => {
      if (isIndividual) {
        return '';
      }
      const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
      if (cleaned.length === 0) {
        return '';
      }
      const nombres = joinSpanishNames(cleaned);
      if (cleaned.length === 1) {
        return `Recibimos sus respuestas. Falta que responda: ${nombres}. Pueden hacerlo hasta el ${date}.`;
      }
      return `Recibimos sus respuestas. Falta que respondan: ${nombres}. Pueden hacerlo hasta el ${date}.`;
    },
    rsvpAnswerLabel: (rsvp: 'accepted' | 'declined' | 'pending' | string) => {
      if (rsvp === 'accepted') {
        return 'Asistirá';
      }
      if (rsvp === 'declined') {
        return 'No asistirá';
      }
      return 'Sin respuesta';
    },
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
    releaseGiftButton: isIndividual ? 'Ya no lo llevo' : 'Ya no lo llevamos',
    releaseGiftTitle: 'Dejar este regalo',
    releaseGiftConfirm: (giftName: string) =>
      isIndividual
        ? `¿Ya no llevarás ${giftName}? Quedará libre para que alguien más lo elija.`
        : `¿Ya no llevarán ${giftName}? Quedará libre para que alguien más lo elija.`,
    releaseGiftConfirmButton: 'Sí, dejarlo libre',
    chooseGiftAriaLabel: (giftName: string) => `Elegir este regalo: ${giftName}`,
    releaseGiftAriaLabel: (giftName: string) =>
      isIndividual ? `Ya no lo llevo: ${giftName}` : `Ya no lo llevamos: ${giftName}`,
    giftsTitle: 'Un detalle para Eloise',
    giftsIntro: isIndividual
      ? [
          'Tu compañía es el mejor regalo, así que no sientas ningún compromiso. Si te hace ilusión llevar algo, preparamos una lista con algunas ideas.',
        ]
      : [
          'Su compañía es el mejor regalo, así que no sientan ningún compromiso. Si les hace ilusión llevar algo, preparamos una lista con algunas ideas.',
        ],
    giftsPageIntro: isIndividual
      ? 'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, elige de la lista para que los regalos no se repitan.'
      : 'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, elijan de la lista para que los regalos no se repitan.',
    giftsPageIntroNoList: isIndividual
      ? 'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, aquí tienes algunas ideas.'
      : 'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, aquí tienen algunas ideas.',
    giftsPageIntroClosed: isIndividual
      ? 'La lista de regalos ya cerró. Gracias por tu cariño: tu compañía es el mejor regalo.'
      : 'La lista de regalos ya cerró. Gracias por su cariño: su compañía es el mejor regalo.',
    giftsPageIntroSoldOut: isIndividual
      ? 'Ya eligieron todos los regalos de la lista. Si te hace ilusión llevar algo, al final encontrarás algunas ideas.'
      : 'Ya eligieron todos los regalos de la lista. Si les hace ilusión llevar algo, al final encontrarán algunas ideas.',
    giftsPageIntroSoldOutNoExtras: isIndividual
      ? 'Ya eligieron todos los regalos de la lista. Gracias por tu cariño: tu compañía es el mejor regalo.'
      : 'Ya eligieron todos los regalos de la lista. Gracias por su cariño: su compañía es el mejor regalo.',
    giftsCardClosed: 'La lista de regalos ya cerró.',
    giftsAnonymityNote: isIndividual
      ? 'Es anónimo: ni nosotros ni los demás invitados sabremos qué elegiste.'
      : 'Es anónimo: ni nosotros ni los demás invitados sabremos qué eligieron.',
    giftsMoreBelow: isIndividual
      ? 'Al final también encontrarás'
      : 'Al final también encontrarán',
    giftsBasicsTitle: isIndividual
      ? 'Básicos que nunca sobran, tráelos si quieres'
      : 'Básicos que nunca sobran, tráiganlos si quieren',
    giftReservedConfirmation: isIndividual
      ? '¡Listo! Quedó elegido. Solo tú sabes que lo elegiste.'
      : '¡Listo! Quedó elegido. Solo ustedes saben que lo eligieron.',
    entryCodeTitle: 'Código de entrada',
    entryCodeInstruction: isIndividual
      ? 'Muestra este código en la entrada'
      : 'Muestren este código en la entrada. Sirve para todo el grupo.',
    entryCodeTip: isIndividual
      ? 'Tómale una captura de pantalla para tenerlo a mano, aunque no haya señal.'
      : 'Tómenle una captura de pantalla para tenerlo a mano, aunque no haya señal.',
  };
}
