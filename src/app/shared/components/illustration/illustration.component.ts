import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeAsset, ThemeId, ThemeService } from '../../../core/theme/theme.service';

export type IllustrationName = 'countdown' | 'empty-state' | 'rsvp-sent' | 'gift-reserved';

@Component({
  selector: 'app-illustration',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img class="illustration" [src]="src()" [alt]="alt()" loading="lazy" />
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class IllustrationComponent {
  private readonly themeService = inject(ThemeService);

  readonly name = input.required<IllustrationName>();
  readonly alt = input.required<string>();
  readonly themeId = input<ThemeId | string | null | undefined>(undefined);

  readonly src = computed(() => {
    const activeTheme = this.themeId() ?? this.themeService.current();
    const assetFile: ThemeAsset = `${this.name()}.webp`;
    return this.themeService.asset(activeTheme, assetFile);
  });
}
