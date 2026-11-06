import { AlertController } from '@ionic/angular';

export interface DiscardGuard {
  hasChanges: () => boolean;
  canDismiss: (data?: unknown, role?: string) => Promise<boolean>;
}

export function createDiscardGuard(
  alertController: AlertController,
  message = 'Lo que escribiste en esta invitación se perderá.',
): DiscardGuard {
  let isAlertOpen = false;

  const guard: DiscardGuard = {
    hasChanges: () => false,
    canDismiss: async (_data?: unknown, role?: string): Promise<boolean> => {
      if (role === 'saved') {
        return true;
      }

      if (!guard.hasChanges()) {
        return true;
      }

      if (isAlertOpen) {
        return false;
      }

      isAlertOpen = true;
      try {
        const alert = await alertController.create({
          header: '¿Descartar los cambios?',
          message,
          buttons: [
            { text: 'Seguir editando', role: 'cancel' },
            { text: 'Descartar', role: 'destructive' },
          ],
        });

        await alert.present();
        const { role: dismissRole } = await alert.onDidDismiss();
        return dismissRole === 'destructive';
      } finally {
        isAlertOpen = false;
      }
    },
  };

  return guard;
}
