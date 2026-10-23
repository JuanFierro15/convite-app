import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeStatus = 'accepted' | 'pending' | 'declined' | 'partial';

const STATUS_LABELS: Record<BadgeStatus, string> = {
  accepted: 'Confirmada',
  pending: 'Pendiente',
  declined: 'Cancelada',
  partial: 'Parcial',
};

const STATUS_CLASSES: Record<BadgeStatus, string> = {
  accepted: 'badge-soft-success',
  pending: 'badge-soft-warning',
  declined: 'badge-soft-danger',
  partial: 'badge-soft-tertiary',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="text-label" [class]="badgeClass()">{{ displayText() }}</span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  readonly status = input.required<BadgeStatus>();
  readonly label = input<string | null | undefined>(undefined);

  readonly displayText = computed(() => {
    const customLabel = this.label()?.trim();
    return customLabel ? customLabel : STATUS_LABELS[this.status()];
  });

  readonly badgeClass = computed(() => STATUS_CLASSES[this.status()]);
}
