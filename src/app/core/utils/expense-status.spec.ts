import {
  expenseStatus,
  expenseStatusBadgeClass,
  expenseStatusLabel,
  paidTotal,
} from './expense-status';

describe('expense-status utils', () => {
  describe('paidTotal', () => {
    it('returns 0 for empty payments list', () => {
      expect(paidTotal([])).toBe(0);
    });

    it('sums payment amounts correctly', () => {
      const payments = [
        { amount_cop: 50000 },
        { amount_cop: 25000 },
        { amount_cop: 10000 },
      ];
      expect(paidTotal(payments)).toBe(85000);
    });
  });

  describe('expenseStatus', () => {
    const amount = 100000;

    it('returns pending when paid is 0 or negative', () => {
      expect(expenseStatus(amount, 0)).toBe('pending');
      expect(expenseStatus(amount, -1000)).toBe('pending');
    });

    it('returns partial when paid is 1 (boundary)', () => {
      expect(expenseStatus(amount, 1)).toBe('partial');
    });

    it('returns partial when paid is amount - 1 (boundary)', () => {
      expect(expenseStatus(amount, amount - 1)).toBe('partial');
    });

    it('returns paid when paid equals amount', () => {
      expect(expenseStatus(amount, amount)).toBe('paid');
    });

    it('returns paid when paid exceeds amount', () => {
      expect(expenseStatus(amount, amount + 1)).toBe('paid');
      expect(expenseStatus(amount, amount + 50000)).toBe('paid');
    });
  });

  describe('expenseStatusLabel', () => {
    it('returns correct labels in Spanish', () => {
      expect(expenseStatusLabel('pending')).toBe('Pendiente');
      expect(expenseStatusLabel('partial')).toBe('Abonado');
      expect(expenseStatusLabel('paid')).toBe('Pagado');
    });
  });

  describe('expenseStatusBadgeClass', () => {
    it('returns correct CSS classes for soft badges', () => {
      expect(expenseStatusBadgeClass('pending')).toBe('badge-soft-medium');
      expect(expenseStatusBadgeClass('partial')).toBe('badge-soft-warning');
      expect(expenseStatusBadgeClass('paid')).toBe('badge-soft-success');
    });
  });
});
