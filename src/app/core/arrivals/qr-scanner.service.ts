import { Injectable } from '@angular/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { classifyScanError } from './arrival-logic';

export type QrScanOutcome =
  | { status: 'scanned'; text: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  async scan(): Promise<QrScanOutcome> {
    if (!this.isAvailable()) {
      return { status: 'unavailable' };
    }

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
