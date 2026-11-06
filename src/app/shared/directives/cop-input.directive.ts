import { Directive, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { formatCopInput } from '../../core';

interface IonInputEventDetail {
  value?: string | number | null;
  event?: Event;
}

@Directive({
  selector: 'ion-input[appCopInput]',
  standalone: true,
})
export class CopInputDirective {
  private readonly ngControl = inject(NgControl, { self: true });

  @HostListener('ionInput', ['$event'])
  onInput(event: CustomEvent<IonInputEventDetail>): void {
    const native = event.detail.event?.target;
    if (!(native instanceof HTMLInputElement)) {
      return;
    }

    const raw = native.value;
    const formatted = formatCopInput(raw, native.selectionStart ?? raw.length);
    if (formatted.value === raw) {
      return;
    }

    this.ngControl.control?.setValue(formatted.value);
    // Al escribir el valor, el accesor de Ionic ya no ve un cambio y no marcaría el control.
    this.ngControl.control?.markAsDirty();

    // ion-input no toca el campo nativo mientras el teclado está componiendo texto.
    native.value = formatted.value;
    native.setSelectionRange(formatted.caret, formatted.caret);
  }
}
