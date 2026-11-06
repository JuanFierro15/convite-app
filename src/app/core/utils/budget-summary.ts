import {
  BudgetSummary,
  CategoryBreakdown,
  ExpenseCategoryRow,
  ExpenseWithPayments,
  ProfileBreakdown,
} from '../models/budget';
import { TeamProfileRow } from '../models/team-profiles';
import { paidTotal } from './expense-status';
import { formatCop } from './money';

export function budgetSummary(
  budgetCop: number | null,
  expenses: readonly ExpenseWithPayments[]
): BudgetSummary {
  const committed = expenses.reduce((sum, e) => sum + e.amount_cop, 0);
  const paid = expenses.reduce((sum, e) => sum + paidTotal(e.payments ?? []), 0);
  const toPay = committed - paid;
  const available = budgetCop !== null ? budgetCop - committed : null;
  const overBy = available !== null && available < 0 ? -available : 0;

  return {
    budget: budgetCop,
    committed,
    paid,
    toPay,
    available,
    overBy,
  };
}

export function byCategory(
  expenses: readonly ExpenseWithPayments[],
  categories: readonly ExpenseCategoryRow[]
): CategoryBreakdown[] {
  const categoryNames = new Map<string, string>();
  for (const cat of categories) {
    categoryNames.set(cat.id, cat.name);
  }

  const categoryAggregates = new Map<string, { committed: number; paid: number }>();

  for (const expense of expenses) {
    const existing = categoryAggregates.get(expense.category_id) ?? { committed: 0, paid: 0 };
    existing.committed += expense.amount_cop;
    existing.paid += paidTotal(expense.payments ?? []);
    categoryAggregates.set(expense.category_id, existing);
  }

  const result: CategoryBreakdown[] = [];
  for (const [categoryId, totals] of categoryAggregates.entries()) {
    result.push({
      category_id: categoryId,
      name: categoryNames.get(categoryId) ?? 'Sin categoría',
      committed: totals.committed,
      paid: totals.paid,
    });
  }

  return result.sort(
    (a, b) => b.committed - a.committed || a.name.localeCompare(b.name, 'es')
  );
}

export function byProfile(
  expenses: readonly ExpenseWithPayments[],
  profiles: readonly TeamProfileRow[]
): ProfileBreakdown[] {
  const profileNames = new Map<string, string>();
  for (const profile of profiles) {
    profileNames.set(profile.id, profile.name);
  }

  const profileTotals = new Map<string, number>();

  for (const expense of expenses) {
    for (const payment of expense.payments ?? []) {
      const current = profileTotals.get(payment.paid_by_profile_id) ?? 0;
      profileTotals.set(payment.paid_by_profile_id, current + payment.amount_cop);
    }
  }

  const result: ProfileBreakdown[] = [];
  for (const [profileId, paid] of profileTotals.entries()) {
    if (paid > 0) {
      result.push({
        profile_id: profileId,
        name: profileNames.get(profileId) ?? 'Perfil no disponible',
        paid,
      });
    }
  }

  return result.sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name, 'es'));
}

export function budgetCardText(budgetCop: number | null, committed: number): string {
  if (budgetCop !== null) {
    return `Van ${formatCop(committed)} de ${formatCop(budgetCop)}`;
  }
  return `Van ${formatCop(committed)} en gastos`;
}
