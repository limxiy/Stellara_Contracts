/**
 * Account type enumeration based on accounting equation
 */
export enum AccountType {
  // Balance Sheet Accounts
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  
  // Income Statement Accounts
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

/**
 * Account subtype for detailed classification
 */
export enum AccountSubtype {
  // Assets
  CASH = 'CASH',
  BANK = 'BANK',
  ACCOUNTS_RECEIVABLE = 'ACCOUNTS_RECEIVABLE',
  INVENTORY = 'INVENTORY',
  FIXED_ASSETS = 'FIXED_ASSETS',
  ACCUMULATED_DEPRECIATION = 'ACCUMULATED_DEPRECIATION',
  INTANGIBLE_ASSETS = 'INTANGIBLE_ASSETS',
  
  // Liabilities
  ACCOUNTS_PAYABLE = 'ACCOUNTS_PAYABLE',
  ACCRUED_EXPENSES = 'ACCRUED_EXPENSES',
  DEFERRED_REVENUE = 'DEFERRED_REVENUE',
  LONG_TERM_DEBT = 'LONG_TERM_DEBT',
  
  // Equity
  COMMON_STOCK = 'COMMON_STOCK',
  RETAINED_EARNINGS = 'RETAINED_EARNINGS',
  ADDITIONAL_PAID_IN_CAPITAL = 'ADDITIONAL_PAID_IN_CAPITAL',
  
  // Revenue
  OPERATING_REVENUE = 'OPERATING_REVENUE',
  NON_OPERATING_REVENUE = 'NON_OPERATING_REVENUE',
  
  // Expenses
  COST_OF_GOODS_SOLD = 'COST_OF_GOODS_SOLD',
  OPERATING_EXPENSE = 'OPERATING_EXPENSE',
  DEPRECIATION_EXPENSE = 'DEPRECIATION_EXPENSE',
  INTEREST_EXPENSE = 'INTEREST_EXPENSE',
  TAX_EXPENSE = 'TAX_EXPENSE',
}

/**
 * Normal balance side for account types
 */
export enum NormalBalance {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * Currency code (ISO 4217 + Crypto)
 */
export enum CurrencyCode {
  // Fiat Currencies
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  JPY = 'JPY',
  CHF = 'CHF',
  CAD = 'CAD',
  AUD = 'AUD',
  CNY = 'CNY',
  INR = 'INR',
  BRL = 'BRL',
  
  // Cryptocurrencies
  BTC = 'BTC',
  ETH = 'ETH',
  USDT = 'USDT',
  USDC = 'USDC',
  XLM = 'XLM',
}

/**
 * Entry side (debit or credit)
 */
export enum EntrySide {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * Transaction status
 */
export enum TransactionStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
  VOID = 'VOID',
}

/**
 * Period status
 */
export enum PeriodStatus {
  OPEN = 'OPEN',
  SOFT_CLOSED = 'SOFT_CLOSED', // Adjustments allowed
  HARD_CLOSED = 'HARD_CLOSED', // No changes allowed
}

/**
 * Account interface
 */
export interface Account {
  id: string;
  code: string; // Unique account code (e.g., "1000", "2100")
  name: string;
  type: AccountType;
  subtype?: AccountSubtype;
  currency: CurrencyCode;
  normalBalance: NormalBalance;
  parentId?: string; // For hierarchical accounts
  isActive: boolean;
  isSystemAccount: boolean; // System-managed vs user-created
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Journal entry line item
 */
export interface JournalEntryLine {
  id: string;
  entryId: string;
  accountId: string;
  side: EntrySide;
  amount: bigint; // In smallest currency unit
  amountBase: bigint; // In base currency (for multi-currency)
  currency: CurrencyCode;
  exchangeRate?: number; // Rate used for conversion
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Journal entry header
 */
export interface JournalEntry {
  id: string;
  entryNumber: string; // Human-readable reference
  transactionDate: Date;
  postingDate?: Date; // May differ for back-dated entries
  status: TransactionStatus;
  entryType: string; // e.g., "TRADE", "FEE", "ADJUSTMENT"
  sourceType?: string; // Originating system/module
  sourceId?: string; // Reference to source document
  description: string;
  totalDebits: bigint;
  totalCredits: bigint;
  baseCurrency: CurrencyCode;
  createdBy: string;
  postedBy?: string;
  postedAt?: Date;
  reversedBy?: string;
  reversedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Account balance snapshot
 */
export interface AccountBalance {
  id: string;
  accountId: string;
  currency: CurrencyCode;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: bigint;
  closingBalance: bigint;
  debitTotal: bigint;
  creditTotal: bigint;
  entryCount: number;
  isTemporary: boolean; // For income statement accounts
}

/**
 * Multi-currency position
 */
export interface CurrencyPosition {
  currency: CurrencyCode;
  originalAmount: bigint;
  baseCurrencyAmount: bigint;
  exchangeRate: number;
  unrealizedGainLoss?: bigint;
}

/**
 * Trial balance line
 */
export interface TrialBalanceLine {
  account: Account;
  accountCode: string;
  accountName: string;
  debitBalance: bigint;
  creditBalance: bigint;
  netBalance: bigint;
  entryCount: number;
}

/**
 * Financial statement section
 */
export interface FinancialStatementSection {
  name: string;
  lines: FinancialStatementLine[];
  total: bigint;
  subsections?: FinancialStatementSection[];
}

/**
 * Financial statement line item
 */
export interface FinancialStatementLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: bigint;
  percentage?: number; // % of total/revenue
  priorPeriodAmount?: bigint; // For comparison
}

/**
 * Reconciliation record
 */
export interface Reconciliation {
  id: string;
  accountId: string;
  periodEndDate: Date;
  statementBalance: bigint;
  ledgerBalance: bigint;
  difference: bigint;
  reconcilingItems: ReconcilingItem[];
  status: 'PENDING' | 'COMPLETED' | 'FLAGGED';
  preparedBy: string;
  reviewedBy?: string;
  completedAt?: Date;
  notes?: string;
}

/**
 * Reconciling item (timing differences, errors, etc.)
 */
export interface ReconcilingItem {
  id: string;
  type: 'TIMING' | 'ERROR' | 'OMISSION' | 'OTHER';
  description: string;
  amount: bigint;
  side: EntrySide;
  resolved: boolean;
  resolutionNotes?: string;
}

/**
 * Accounting period
 */
export interface AccountingPeriod {
  id: string;
  name: string; // e.g., "2024-01", "Q1-2024", "FY2024"
  startDate: Date;
  endDate: Date;
  type: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  status: PeriodStatus;
  closedAt?: Date;
  closedBy?: string;
  adjustmentsAllowed: boolean;
}

/**
 * Exchange rate record
 */
export interface ExchangeRate {
  id: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  inverseRate: number;
  effectiveDate: Date;
  source: string; // e.g., "ECB", "COINBASE", "MANUAL"
  isDailyRate: boolean;
  createdAt: Date;
}
