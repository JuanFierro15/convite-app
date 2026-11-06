import { ExpenseStatus } from '../models/budget';

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pendiente',
  partial: 'Abonado',
  paid: 'Pagado',
};

const STATUS_BADGE_CLASSES: Record<ExpenseStatus, string> = {
  pending: 'badge-soft-medium',
  partial: 'badge-soft-warning',
  paid: 'badge-soft-success',
};

export function paidTotal(payments: readonly { amount_cop: number }[]): number {
  return payments.reduce((sum, payment) => sum + (payment.amount_cop ?? 0), 0);
}

export function expenseStatus(amountCop: number, paidCop: number): ExpenseStatus {
  if (paidCop <= 0) {
    return 'pending';
  }
  if (paidCop >= amountCop) {
    return 'paid';
  }
  return 'partial';
}

export function expenseStatusLabel(status: ExpenseStatus): string {
  return STATUS_LABELS[status];
}

export function expenseStatusBadgeClass(status: ExpenseStatus): string {
  return STATUS_BADGE_CLASSES[status];
}
