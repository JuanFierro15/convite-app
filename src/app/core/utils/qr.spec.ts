import { invitationQrOptions } from './qr';

describe('qr utils', () => {
  it('returns qr options with theme colors when present', () => {
    const fakeStyles: Pick<CSSStyleDeclaration, 'getPropertyValue'> = {
      getPropertyValue: (prop: string) => {
        if (prop === '--ion-color-dark') {
          return '  #222428  ';
        }
        if (prop === '--ion-background-color') {
          return '  #ffffff  ';
        }
        return '';
      },
    };

    const options = invitationQrOptions(fakeStyles);
    expect(options).toEqual({
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#222428',
        light: '#ffffff',
      },
    });
  });

  it('sets color properties to undefined when styles are empty or whitespace', () => {
    const emptyStyles: Pick<CSSStyleDeclaration, 'getPropertyValue'> = {
      getPropertyValue: () => '   ',
    };

    const options = invitationQrOptions(emptyStyles);
    expect(options).toEqual({
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: undefined,
        light: undefined,
      },
    });
  });
});
