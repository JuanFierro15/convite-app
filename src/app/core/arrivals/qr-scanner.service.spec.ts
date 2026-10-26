import { TestBed } from '@angular/core/testing';
import { CapacitorBarcodeScanner } from '@capacitor/barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { QrScannerService } from './qr-scanner.service';

describe('QrScannerService', () => {
  let service: QrScannerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QrScannerService);
  });

  it('returns unavailable when platform is not native', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

    expect(service.isAvailable()).toBe(false);
    const outcome = await service.scan();
    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it('scans successfully on native platform', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode').mockResolvedValue({
      ScanResult: 'ABCD2345GH',
      format: 0 as never,
    });

    const outcome = await service.scan();
    expect(outcome).toEqual({ status: 'scanned', text: 'ABCD2345GH' });
  });

  it('returns cancelled when ScanResult is empty', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode').mockResolvedValue({
      ScanResult: '   ',
      format: 0 as never,
    });

    const outcome = await service.scan();
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('classifies scanner plugin rejection correctly', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(CapacitorBarcodeScanner, 'scanBarcode').mockRejectedValue({
      code: 'OS-PLUG-BARC-0006',
      message: 'Barcode scan was cancelled',
    });

    const outcome = await service.scan();
    expect(outcome).toEqual({ status: 'cancelled' });
  });
});
