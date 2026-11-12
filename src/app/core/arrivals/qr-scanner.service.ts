import { Injectable, inject } from '@angular/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { CameraPermissionService } from '../photos/camera-permission.service';
import { classifyScanError } from './arrival-logic';

export type QrScanOutcome =
  | { status: 'scanned'; text: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'permission-denied' }
  | { status: 'permission-permanently-denied' };

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  private readonly permissions = inject(CameraPermissionService);

  isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  async scan(): Promise<QrScanOutcome> {
    if (!this.isAvailable()) {
      return { status: 'unavailable' };
    }

    const permission = await this.permissions.ensureCamera();
    if (permission === 'denied') {
      return { status: 'permission-denied' };
    }
    if (permission === 'permanently-denied') {
      return { status: 'permission-permanently-denied' };
    }
    // Si la consulta del permiso falla, se abre el lector como antes: él mismo pide el permiso.

    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: 'Apunta la cámara al código QR de la invitación',
        scanButton: false,
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.PORTRAIT,
        cancelButtonAccessibilityLabel: 'Cancelar',
        torchButtonOnAccessibilityLabel: 'Apagar linterna',
        torchButtonOffAccessibilityLabel: 'Encender linterna',
        android: {
          scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT,
        },
      });

      const text = result?.ScanResult?.trim() ?? '';
      if (!text) {
        return { status: 'cancelled' };
      }

      return { status: 'scanned', text };
    } catch (error: unknown) {
      const status = classifyScanError(error);
      return { status };
    }
  }
}
