import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonInput } from '@ionic/angular';
import { CopInputDirective } from './cop-input.directive';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, IonInput, CopInputDirective],
  template: `<ion-input appCopInput [formControl]="control"></ion-input>`,
})
class HostComponent {
  readonly control = new FormControl('', { nonNullable: true });
}

describe('CopInputDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let native: HTMLInputElement;

  function type(value: string, caret = value.length): void {
    native.value = value;
    native.setSelectionRange(caret, caret);
    const host = (fixture.nativeElement as HTMLElement).querySelector('ion-input');
    host?.dispatchEvent(
      new CustomEvent('ionInput', {
        bubbles: true,
        composed: true,
        detail: { value, event: { target: native } },
      }),
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    native = document.createElement('input');
  });

  it('agrega los puntos en el control y en el campo nativo', () => {
    type('1000');

    expect(fixture.componentInstance.control.value).toBe('1.000');
    expect(native.value).toBe('1.000');
    expect(native.selectionStart).toBe(5);
  });

  it('marca el control como modificado para que se avise antes de descartar', () => {
    type('1000');

    expect(fixture.componentInstance.control.dirty).toBe(true);
  });

  it('conserva el cursor cuando se escribe en medio del número', () => {
    type('1.2000', 3);

    expect(native.value).toBe('12.000');
    expect(native.selectionStart).toBe(2);
  });

  it('no toca el campo si el valor ya está bien formateado', () => {
    native.value = '100';
    const spy = vi.spyOn(native, 'setSelectionRange');
    const host = (fixture.nativeElement as HTMLElement).querySelector('ion-input');

    host?.dispatchEvent(
      new CustomEvent('ionInput', { detail: { value: '100', event: { target: native } } }),
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
