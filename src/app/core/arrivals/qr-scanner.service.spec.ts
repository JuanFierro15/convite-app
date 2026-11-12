import { TestBed } from '@angular/core/testing';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { CameraPermissionService } from '../photos/camera-permission.service';
import { QrScannerService } from './qr-scanner.service';

describe('QrScannerService', () => {
  let service: QrScannerService;
  let mockCameraPermission: {
    ensureCamera: ReturnType<typeof vi.fn>;
    openAppSettings: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCameraPermission = {
      ensureCamera: vi.fn().mockResolvedValue('granted'),
      openAppSettings: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: CameraPermissionService, useValue: mockCameraPermission },
      ],
    });
    service = TestBed.inject(QrScannerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns unavailable when platform is not native without checking permissions or opening scanner', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const scanBarcodeSpy = vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode');

    expect(service.isAvailable()).toBe(false);
    const outcome = await service.scan();

    expect(outcome).toEqual({ status: 'unavailable' });
    expect(mockCameraPermission.ensureCamera).not.toHaveBeenCalled();
    expect(scanBarcodeSpy).not.toHaveBeenCalled();
  });

  it('returns permission-denied without calling scanner when camera permission is denied', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockCameraPermission.ensureCamera.mockResolvedValue('denied');
    const scanBarcodeSpy = vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode');

    const outcome = await service.scan();

    expect(outcome).toEqual({ status: 'permission-denied' });
    expect(mockCameraPermission.ensureCamera).toHaveBeenCalled();
    expect(scanBarcodeSpy).not.toHaveBeenCalled();
  });

  it('returns permission-permanently-denied without calling scanner when permission is permanently denied', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockCameraPermission.ensureCamera.mockResolvedValue('permanently-denied');
    const scanBarcodeSpy = vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode');

    const outcome = await service.scan();

    expect(outcome).toEqual({ status: 'permission-permanently-denied' });
    expect(mockCameraPermission.ensureCamera).toHaveBeenCalled();
    expect(scanBarcodeSpy).not.toHaveBeenCalled();
  });

  it('opens the scanner as before when ensureCamera returns unavailable', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockCameraPermission.ensureCamera.mockResolvedValue('unavailable');
    const scanBarcodeSpy = vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode').mockResolvedValue({ ScanResult: 'ABCDEFGHJK', format: 0 } as never);

    const outcome = await service.scan();

    expect(outcome).toEqual({ status: 'scanned', text: 'ABCDEFGHJK' });
    expect(mockCameraPermission.ensureCamera).toHaveBeenCalled();
    expect(scanBarcodeSpy).toHaveBeenCalledTimes(1);
  });

  it('scans successfully with expected options when camera permission is granted', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockCameraPermission.ensureCamera.mockResolvedValue('granted');
    const scanBarcodeSpy = vi
      .spyOn(CapacitorBarcodeScanner, 'scanBarcode')
      .mockResolvedValue({
        ScanResult: 'ABCD2345GH',
        format: 0 as never,
      });

    const outcome = await service.scan();

    expect(outcome).toEqual({ status: 'scanned', text: 'ABCD2345GH' });
    expect(scanBarcodeSpy).toHaveBeenCalledWith({
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
  });

  it('returns cancelled when ScanResult is empty', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockCameraPermission.ensureCamera.mockResolvedValue('granted');
    vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode').mockResolvedValue({
      ScanResult: '   ',
      format: 0 as never,
    });

    const outcome = await service.scan();
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('classifies scanner plugin rejection correctly for cancellation', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockCameraPermission.ensureCamera.mockResolvedValue('granted');
    vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode').mockRejectedValue({
      code: 'OS-PLUG-BARC-0006',
      message: 'Barcode scan was cancelled',
    });

    const outcome = await service.scan();
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('classifies scanner plugin rejection correctly for permission denied (0007 / camera access)', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockCameraPermission.ensureCamera.mockResolvedValue('granted');
    vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode').mockRejectedValue({
      code: 'OS-PLUG-BARC-0007',
      message: "Couldn't scan because camera access wasn't provided.",
    });

    const outcome = await service.scan();
    expect(outcome).toEqual({ status: 'permission-denied' });
  });
});
