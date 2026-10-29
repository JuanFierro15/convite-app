import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { AlertController, ToastController } from '@ionic/angular';
import {
  EventRow,
  InvitationRow,
  InvitationsRepository,
  invitationMessage,
  toInvitationKind,
  whatsappUrl,
} from '../../core';

@Injectable({ providedIn: 'root' })
export class InvitationActionsService {
  private readonly invitationsRepository = inject(InvitationsRepository);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  whatsAppMessage(
    invitation: Pick<InvitationRow, 'group_name' | 'code' | 'kind'>,
    event: Pick<EventRow, 'name' | 'starts_at' | 'rsvp_deadline'>,
  ): string {
    return invitationMessage({
      kind: toInvitationKind(invitation.kind),
      groupName: invitation.group_name,
      eventName: event.name,
      startsAt: event.starts_at,
      rsvpDeadline: event.rsvp_deadline,
      link: this.invitationsRepository.guestLink(invitation.code),
    });
  }

  async shareWhatsApp(
    invitation: Pick<InvitationRow, 'id' | 'group_name' | 'phone' | 'code' | 'kind'>,
    event: Pick<EventRow, 'name' | 'starts_at' | 'rsvp_deadline'>,
  ): Promise<boolean> {
    const message = this.whatsAppMessage(invitation, event);

    const markSent = async (): Promise<void> => {
      try {
        await this.invitationsRepository.markWhatsAppSent(invitation.id);
      } catch {
        await this.showToast(
          'Se abrió WhatsApp, pero no pudimos marcar la invitación como enviada.',
          'warning',
        );
      }
    };

    const url = whatsappUrl(invitation.phone, message);
    if (url) {
      window.open(url, '_blank');
      await markSent();
      return true;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: event.name,
          text: message,
        });
        await markSent();
        return true;
      } catch {
        // El usuario puede cerrar la hoja de compartir sin elegir una app.
        return false;
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: event.name,
          text: message,
        });
        await markSent();
        return true;
      } catch {
        // El navegador lanza AbortError si el usuario cancela el menú de compartir.
        return false;
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      await this.showToast('Copiamos el mensaje para que lo compartas.', 'primary');
    } catch (err) {
      await this.showError(err);
    }
    return false;
  }

  async confirmDelete(
    invitation: Pick<InvitationRow, 'id' | 'group_name'>,
    onDeleting?: () => void,
  ): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Borrar invitación',
      message: `¿Borrar la invitación de ${invitation.group_name}? Esta acción no se puede deshacer.`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Borrar',
          role: 'destructive',
        },
      ],
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') {
      return false;
    }

    onDeleting?.();
    try {
      await this.invitationsRepository.remove(invitation.id);
      return true;
    } catch (err) {
      await this.showError(err);
      return false;
    }
  }

  async showError(err: unknown): Promise<void> {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'No pudimos completar la acción. Inténtalo de nuevo.';
    await this.showToast(message, 'danger');
  }

  async showToast(
    message: string,
    color: 'primary' | 'success' | 'warning' | 'danger' = 'primary',
  ): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
