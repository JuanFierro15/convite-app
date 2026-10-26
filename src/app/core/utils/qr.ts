import QRCode, { type QRCodeToDataURLOptions } from 'qrcode';

export function invitationQrOptions(
  styles: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): QRCodeToDataURLOptions {
  const dark = styles.getPropertyValue('--ion-color-dark').trim();
  const light = styles.getPropertyValue('--ion-background-color').trim();

  return {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: dark || undefined,
      light: light || undefined,
    },
  };
}

export function qrImageDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, invitationQrOptions(getComputedStyle(document.documentElement)));
}
