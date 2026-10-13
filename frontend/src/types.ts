export type Money = string;
export type Page =
  | "Overview"
  | "Transactions"
  | "Properties & loans"
  | "Income"
  | "Budgets"
  | "Accounts"
  | "Imports";
export interface Account {
  id: number;
  provider: string;
  number: string;
  name: string;
  currency: string;
  kind: string;
  transaction_count: number;
}
export interface Property {
  id: number;
  name: string;
  address: string;
  notes: string;
}
export interface PropertySummary extends Property {
  rental: Money;
  expenses: Money;
  repayments: Money;
  cash_flow: Money;
  allocated_balance: Money | null;
  loan_count: number;
  currency_loan_count: number;
  known_balance_count: number;
  banks: string[];
}
export interface Loan {
  id: number;
  name: string;
  account_id: number;
  offset_account_id: number | null;
  balance: Money | null;
  balance_as_of: string | null;
  interest_rate: string | null;
  allocations: { property_id: number; share: string }[];
}
export interface Income {
  id: number;
  name: string;
  kind: string;
  property_id: number | null;
  expected_monthly: Money | null;
  currency: string;
  received?: Money;
}
export interface Transaction {
  id: number;
  account_id: number;
  external_id: string;
  import_id: number;
  description: string;
  amount: string;
  currency: string;
  transaction_date: string;
  posted_date: string | null;
  category: string;
  budget_category: string;
  kind: string;
  suggestion: string;
  included: boolean;
  notes: string;
  location: string;
  property_id: number | null;
  income_source_id: number | null;
  raw?: Record<string, string | boolean>;
}
export interface Budget {
  id: number;
  category: string;
  amount: Money;
  spent: Money;
  month: string;
  currency: string;
}
export interface Batch {
  id: number;
  filename: string;
  created_at: string;
  status: string;
  summary: Record<string, number>;
}
export interface ImportRow {
  line: number;
  status: string;
  error: string | null;
  data: Record<string, string | boolean> | null;
}
export interface Preview {
  id: number;
  summary: Record<string, number>;
  rows: ImportRow[];
  accounts: {
    key: string;
    name: string;
    provider: string;
    number: string;
    currency: string;
    account_id: number | null;
  }[];
}
export interface Dashboard {
  month: string;
  currency: string;
  income: Money;
  spending: Money;
  repayments: Money;
  cash_flow: Money;
  review_count: number;
  transaction_count: number;
  total_transactions: number;
  account_count: number;
  currencies: string[];
  income_by_kind: Record<string, Money>;
  sources: Income[];
  properties: PropertySummary[];
  categories: { name: string; amount: Money }[];
  budgets: Budget[];
  trend: { month: string; income: Money; spending: Money }[];
  spending_breakdown: {
    income_categories: { name: string; amount: Money }[];
    expense_categories: { name: string; amount: Money }[];
    earning: Money;
    spending: Money;
    difference: Money;
    savings_rate: string | null;
    provisional_income_count?: number;
  };
}
export interface Workspace {
  accounts: Account[];
  properties: Property[];
  loans: Loan[];
  incomes: Income[];
  imports: Batch[];
  dashboard: Dashboard;
}
