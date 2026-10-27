import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { themeOptionsFor } from '../../../core/theme';
import { ThemePickerComponent } from './theme-picker.component';

@Component({
  template: `<app-theme-picker [formControl]="control" [options]="options" />`,
  imports: [ThemePickerComponent, ReactiveFormsModule],
})
class TestHostComponent {
  readonly control = new FormControl<string>('baby-shower', {
    nonNullable: true,
  });
  readonly options = themeOptionsFor(null);
}

describe('ThemePickerComponent', () => {
  let fixture: ComponentFixture<ThemePickerComponent>;
  let component: ThemePickerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThemePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemePickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', themeOptionsFor('bautizo'));
    fixture.detectChanges();
  });

  it('renders one card per option with data-theme, label, and cover image source', () => {
    const cards = fixture.nativeElement.querySelectorAll(
      '.theme-card',
    ) as NodeListOf<HTMLButtonElement>;
    expect(cards.length).toBe(3);

    const expectedData = [
      {
        id: 'baby-shower',
        label: 'Jardín de algodón',
        src: 'assets/themes/baby-shower/hero-cover.webp',
      },
      {
        id: 'honey-bee',
        label: 'Miel y flores silvestres',
        src: 'assets/themes/honey-bee/hero-cover.webp',
      },
      {
        id: 'bautizo',
        label: 'Bautizo',
        src: 'assets/themes/baby-shower/hero-cover.webp',
      },
    ];

    expectedData.forEach((expected, index) => {
      const card = cards[index];
      expect(card.getAttribute('data-theme')).toBe(expected.id);
      expect(card.querySelector('.theme-card__name')?.textContent).toContain(
        expected.label,
      );
      const img = card.querySelector('img.theme-card__thumb') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe(expected.src);
    });
  });

  it('marks only the selected card when writeValue is called', () => {
    component.writeValue('honey-bee');
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll(
      '.theme-card',
    ) as NodeListOf<HTMLButtonElement>;

    cards.forEach((card) => {
      const themeId = card.getAttribute('data-theme');
      if (themeId === 'honey-bee') {
        expect(card.classList.contains('theme-card--selected')).toBe(true);
        expect(card.getAttribute('aria-checked')).toBe('true');
        expect(card.querySelector('.theme-card__check')).not.toBeNull();
      } else {
        expect(card.classList.contains('theme-card--selected')).toBe(false);
        expect(card.getAttribute('aria-checked')).toBe('false');
        expect(card.querySelector('.theme-card__check')).toBeNull();
      }
    });
  });

  it('calls onChange and onTouched and selects the clicked card', () => {
    const onChangeSpy = vi.fn();
    const onTouchedSpy = vi.fn();
    component.registerOnChange(onChangeSpy);
    component.registerOnTouched(onTouchedSpy);

    const babyShowerCard = fixture.nativeElement.querySelector(
      '.theme-card[data-theme="baby-shower"]',
    ) as HTMLButtonElement;

    babyShowerCard.click();
    fixture.detectChanges();

    expect(onChangeSpy).toHaveBeenCalledWith('baby-shower');
    expect(onTouchedSpy).toHaveBeenCalled();
    expect(babyShowerCard.classList.contains('theme-card--selected')).toBe(true);
  });

  it('calls onTouched but not onChange when clicking the already selected card', () => {
    component.writeValue('baby-shower');
    fixture.detectChanges();

    const onChangeSpy = vi.fn();
    const onTouchedSpy = vi.fn();
    component.registerOnChange(onChangeSpy);
    component.registerOnTouched(onTouchedSpy);

    const babyShowerCard = fixture.nativeElement.querySelector(
      '.theme-card[data-theme="baby-shower"]',
    ) as HTMLButtonElement;

    babyShowerCard.click();
    fixture.detectChanges();

    expect(onTouchedSpy).toHaveBeenCalled();
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('disables buttons and ignores clicks when disabled state is set', () => {
    const onChangeSpy = vi.fn();
    component.registerOnChange(onChangeSpy);

    component.setDisabledState(true);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll(
      '.theme-card',
    ) as NodeListOf<HTMLButtonElement>;
    cards.forEach((card) => {
      expect(card.disabled).toBe(true);
    });

    component.select('honey-bee');
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('integrates with Reactive Forms using host component', () => {
    const hostFixture = TestBed.createComponent(TestHostComponent);
    hostFixture.detectChanges();

    const babyShowerBtn = hostFixture.nativeElement.querySelector(
      '.theme-card[data-theme="baby-shower"]',
    ) as HTMLButtonElement;
    const honeyBeeBtn = hostFixture.nativeElement.querySelector(
      '.theme-card[data-theme="honey-bee"]',
    ) as HTMLButtonElement;

    expect(babyShowerBtn.classList.contains('theme-card--selected')).toBe(true);
    expect(honeyBeeBtn.classList.contains('theme-card--selected')).toBe(false);

    honeyBeeBtn.click();
    hostFixture.detectChanges();

    expect(hostFixture.componentInstance.control.value).toBe('honey-bee');
    expect(hostFixture.componentInstance.control.touched).toBe(true);
    expect(honeyBeeBtn.classList.contains('theme-card--selected')).toBe(true);
    expect(babyShowerBtn.classList.contains('theme-card--selected')).toBe(false);

    hostFixture.componentInstance.control.setValue('baby-shower');
    hostFixture.detectChanges();

    expect(babyShowerBtn.classList.contains('theme-card--selected')).toBe(true);
    expect(honeyBeeBtn.classList.contains('theme-card--selected')).toBe(false);
  });
});
