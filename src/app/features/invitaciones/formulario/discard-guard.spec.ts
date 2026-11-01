import { AlertController } from '@ionic/angular';
import { createDiscardGuard } from './discard-guard';

describe('createDiscardGuard', () => {
  let mockAlertCtrl: { create: ReturnType<typeof vi.fn> };
  let mockAlert: { present: ReturnType<typeof vi.fn>; onDidDismiss: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAlert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    };
    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue(mockAlert),
    };
  });

  it('saved pasa sin alerta incluso con cambios pendientes', async () => {
    const guard = createDiscardGuard(mockAlertCtrl as unknown as AlertController);
    guard.hasChanges = () => true;

    const result = await guard.canDismiss(undefined, 'saved');

    expect(result).toBe(true);
    expect(mockAlertCtrl.create).not.toHaveBeenCalled();
  });

  it('sin cambios pasa sin alerta', async () => {
    const guard = createDiscardGuard(mockAlertCtrl as unknown as AlertController);
    guard.hasChanges = () => false;

    const result = await guard.canDismiss(undefined, 'cancel');

    expect(result).toBe(true);
    expect(mockAlertCtrl.create).not.toHaveBeenCalled();
  });

  it('con cambios abre la alerta con los textos exactos y "Seguir editando" devuelve false', async () => {
    mockAlert.onDidDismiss.mockResolvedValue({ role: 'cancel' });
    const guard = createDiscardGuard(mockAlertCtrl as unknown as AlertController);
    guard.hasChanges = () => true;

    const result = await guard.canDismiss(undefined, 'cancel');

    expect(result).toBe(false);
    expect(mockAlertCtrl.create).toHaveBeenCalledWith({
      header: '¿Descartar los cambios?',
      message: 'Lo que escribiste en esta invitación se perderá.',
      buttons: [
        { text: 'Seguir editando', role: 'cancel' },
        { text: 'Descartar', role: 'destructive' },
      ],
    });
    expect(mockAlert.present).toHaveBeenCalled();
  });

  it('con cambios "Descartar" devuelve true', async () => {
    mockAlert.onDidDismiss.mockResolvedValue({ role: 'destructive' });
    const guard = createDiscardGuard(mockAlertCtrl as unknown as AlertController);
    guard.hasChanges = () => true;

    const result = await guard.canDismiss(undefined, 'cancel');

    expect(result).toBe(true);
  });

  it('una segunda llamada mientras la alerta está abierta devuelve false sin crear otra', async () => {
    let resolveDismiss!: (value: { role: string }) => void;
    const dismissPromise = new Promise<{ role: string }>((resolve) => {
      resolveDismiss = resolve;
    });
    mockAlert.onDidDismiss.mockReturnValue(dismissPromise);

    const guard = createDiscardGuard(mockAlertCtrl as unknown as AlertController);
    guard.hasChanges = () => true;

    const firstCall = guard.canDismiss(undefined, 'cancel');
    const secondCall = guard.canDismiss(undefined, 'cancel');

    const secondResult = await secondCall;
    expect(secondResult).toBe(false);
    expect(mockAlertCtrl.create).toHaveBeenCalledTimes(1);

    resolveDismiss({ role: 'destructive' });
    const firstResult = await firstCall;
    expect(firstResult).toBe(true);
  });
});
