import { ChangeDetectionStrategy, Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle } from 'ionicons/icons';
import { ThemeDefinition, ThemeId, ThemeService } from '../../../core/theme';

@Component({
  selector: 'app-theme-picker',
  templateUrl: 'theme-picker.component.html',
  styleUrls: ['theme-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ThemePickerComponent),
      multi: true,
    },
  ],
})
export class ThemePickerComponent implements ControlValueAccessor {
  private readonly themeService = inject(ThemeService);

  readonly options = input.required<readonly ThemeDefinition[]>();
  readonly value = signal<string | null>(null);
  readonly disabled = signal<boolean>(false);

  private onChange: (value: ThemeId) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    addIcons({ checkmarkCircle });
  }

  coverSrc(themeId: ThemeId): string {
    return this.themeService.asset(themeId, 'hero-cover.webp');
  }

  isSelected(themeId: ThemeId): boolean {
    return this.value() === themeId;
  }

  select(themeId: ThemeId): void {
    if (this.disabled()) {
      return;
    }
    this.onTouched();
    if (this.value() === themeId) {
      return;
    }
    this.value.set(themeId);
    this.onChange(themeId);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: ThemeId) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
