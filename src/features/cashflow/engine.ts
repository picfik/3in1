import type { CashflowState } from "../../types/models";

export function cashflowSummary(state: CashflowState) {
  const passiveIncome = state.assets.reduce((sum, item) => sum + (item.cashflow ?? 0), 0);
  const expenses = state.expenses.reduce((sum, item) => sum + item.amount, 0) + state.children * 300;
  const income = state.salary + passiveIncome + state.extraIncomes.reduce((sum, item) => sum + item.amount, 0);
  const liabilities = state.liabilities.reduce((sum, item) => sum + item.amount, 0);
  const assets = state.assets.reduce((sum, item) => sum + (item.cost ?? 0), 0);
  return {
    passiveIncome,
    expenses,
    income,
    netCashflow: income - expenses,
    netWorth: state.cash + assets - liabilities,
    freedomRatio: expenses > 0 ? Math.min(passiveIncome / expenses, 1) : 0,
    isFree: passiveIncome >= expenses
  };
}