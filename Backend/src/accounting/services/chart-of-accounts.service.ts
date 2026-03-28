import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Account,
  AccountType,
  AccountSubtype,
  NormalBalance,
  CurrencyCode,
} from '../types/accounting.types';

/**
 * Chart of Accounts Service
 * Manages the hierarchical structure of all accounts
 */
@Injectable()
export class ChartOfAccountsService {
  private readonly logger = new Logger(ChartOfAccountsService.name);

  // In-memory cache (in production, use database)
  private accounts = new Map<string, Account>();
  private accountByCode = new Map<string, Account>();

  constructor() {
    this.initializeDefaultChart();
  }

  /**
   * Initialize default chart of accounts
   * Standard numbering: 
   * 1xxx = Assets
   * 2xxx = Liabilities
   * 3xxx = Equity
   * 4xxx = Revenue
   * 5xxx = Expenses
   */
  private initializeDefaultChart(): void {
    const defaultAccounts: Partial<Account>[] = [
      // ASSETS (1xxx)
      { code: '1000', name: 'Cash and Cash Equivalents', type: AccountType.ASSET, subtype: AccountSubtype.CASH, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '1010', name: 'Petty Cash', type: AccountType.ASSET, subtype: AccountSubtype.CASH, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '1100', name: 'Bank Accounts', type: AccountType.ASSET, subtype: AccountSubtype.BANK, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '1110', name: 'Operating Bank Account', type: AccountType.ASSET, subtype: AccountSubtype.BANK, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, subtype: AccountSubtype.ACCOUNTS_RECEIVABLE, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '1300', name: 'Inventory', type: AccountType.ASSET, subtype: AccountSubtype.INVENTORY, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '1400', name: 'Cryptocurrency Holdings', type: AccountType.ASSET, subtype: AccountSubtype.CASH, currency: CurrencyCode.BTC, normalBalance: NormalBalance.DEBIT },
      { code: '1500', name: 'Fixed Assets', type: AccountType.ASSET, subtype: AccountSubtype.FIXED_ASSETS, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '1510', name: 'Accumulated Depreciation', type: AccountType.ASSET, subtype: AccountSubtype.ACCUMULATED_DEPRECIATION, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      
      // LIABILITIES (2xxx)
      { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, subtype: AccountSubtype.ACCOUNTS_PAYABLE, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '2100', name: 'Accrued Expenses', type: AccountType.LIABILITY, subtype: AccountSubtype.ACCRUED_EXPENSES, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '2200', name: 'Deferred Revenue', type: AccountType.LIABILITY, subtype: AccountSubtype.DEFERRED_REVENUE, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '2300', name: 'Long-term Debt', type: AccountType.LIABILITY, subtype: AccountSubtype.LONG_TERM_DEBT, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '2400', name: 'Customer Deposits', type: AccountType.LIABILITY, subtype: AccountSubtype.DEFERRED_REVENUE, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      
      // EQUITY (3xxx)
      { code: '3000', name: 'Common Stock', type: AccountType.EQUITY, subtype: AccountSubtype.COMMON_STOCK, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, subtype: AccountSubtype.RETAINED_EARNINGS, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '3200', name: 'Additional Paid-in Capital', type: AccountType.EQUITY, subtype: AccountSubtype.ADDITIONAL_PAID_IN_CAPITAL, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      
      // REVENUE (4xxx)
      { code: '4000', name: 'Operating Revenue', type: AccountType.REVENUE, subtype: AccountSubtype.OPERATING_REVENUE, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '4010', name: 'Trading Fees Revenue', type: AccountType.REVENUE, subtype: AccountSubtype.OPERATING_REVENUE, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '4020', name: 'Withdrawal Fees Revenue', type: AccountType.REVENUE, subtype: AccountSubtype.OPERATING_REVENUE, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      { code: '4100', name: 'Interest Income', type: AccountType.REVENUE, subtype: AccountSubtype.NON_OPERATING_REVENUE, currency: CurrencyCode.USD, normalBalance: NormalBalance.CREDIT },
      
      // EXPENSES (5xxx)
      { code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, subtype: AccountSubtype.COST_OF_GOODS_SOLD, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '5100', name: 'Operating Expenses', type: AccountType.EXPENSE, subtype: AccountSubtype.OPERATING_EXPENSE, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '5110', name: 'Salaries and Wages', type: AccountType.EXPENSE, subtype: AccountSubtype.OPERATING_EXPENSE, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '5120', name: 'Technology and Infrastructure', type: AccountType.EXPENSE, subtype: AccountSubtype.OPERATING_EXPENSE, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '5200', name: 'Depreciation Expense', type: AccountType.EXPENSE, subtype: AccountSubtype.DEPRECIATION_EXPENSE, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '5300', name: 'Interest Expense', type: AccountType.EXPENSE, subtype: AccountSubtype.INTEREST_EXPENSE, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
      { code: '5400', name: 'Income Tax Expense', type: AccountType.EXPENSE, subtype: AccountSubtype.TAX_EXPENSE, currency: CurrencyCode.USD, normalBalance: NormalBalance.DEBIT },
    ];

    for (const acc of defaultAccounts) {
      this.createAccount(acc as any);
    }

    this.logger.log(`Initialized ${defaultAccounts.length} default accounts`);
  }

  /**
   * Create a new account
   */
  createAccount(accountData: Partial<Account>): Account {
    // Validate account code format
    if (!this.isValidAccountCode(accountData.code)) {
      throw new Error('Invalid account code format. Use 4-digit number (e.g., 1000)');
    }

    // Check for duplicate code
    if (this.accountByCode.has(accountData.code)) {
      throw new Error(`Account code ${accountData.code} already exists`);
    }

    const account: Account = {
      id: this.generateAccountId(accountData.code),
      code: accountData.code!,
      name: accountData.name!,
      type: accountData.type!,
      subtype: accountData.subtype,
      currency: accountData.currency || CurrencyCode.USD,
      normalBalance: accountData.normalBalance || this.getDefaultNormalBalance(accountData.type!),
      parentId: accountData.parentId,
      isActive: accountData.isActive ?? true,
      isSystemAccount: accountData.isSystemAccount ?? false,
      metadata: accountData.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.accounts.set(account.id, account);
    this.accountByCode.set(account.code, account);

    this.logger.debug(`Created account: ${account.code} - ${account.name}`);
    return account;
  }

  /**
   * Get account by ID
   */
  getAccountById(id: string): Account | null {
    return this.accounts.get(id) || null;
  }

  /**
   * Get account by code
   */
  getAccountByCode(code: string): Account | null {
    return this.accountByCode.get(code) || null;
  }

  /**
   * Get all accounts
   */
  getAllAccounts(): Account[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get accounts by type
   */
  getAccountsByType(type: AccountType): Account[] {
    return Array.from(this.accounts.values()).filter(acc => acc.type === type);
  }

  /**
   * Get child accounts (for hierarchical structure)
   */
  getChildAccounts(parentId: string): Account[] {
    return Array.from(this.accounts.values()).filter(acc => acc.parentId === parentId);
  }

  /**
   * Update account
   */
  updateAccount(id: string, updates: Partial<Account>): Account {
    const account = this.getAccountById(id);
    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    // Prevent changing system accounts
    if (account.isSystemAccount) {
      throw new Error('Cannot modify system accounts');
    }

    const updated = { ...account, ...updates, updatedAt: new Date() };
    this.accounts.set(id, updated);
    
    if (updates.code) {
      this.accountByCode.delete(account.code);
      this.accountByCode.set(updates.code, updated);
    }

    return updated;
  }

  /**
   * Deactivate account
   */
  deactivateAccount(id: string): void {
    const account = this.getAccountById(id);
    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    if (account.isSystemAccount) {
      throw new Error('Cannot deactivate system accounts');
    }

    account.isActive = false;
    account.updatedAt = new Date();
    this.accounts.set(id, account);
  }

  /**
   * Get balance sheet accounts only
   */
  getBalanceSheetAccounts(): Account[] {
    return this.getAccountsByType(AccountType.ASSET)
      .concat(this.getAccountsByType(AccountType.LIABILITY))
      .concat(this.getAccountsByType(AccountType.EQUITY));
  }

  /**
   * Get income statement accounts only
   */
  getIncomeStatementAccounts(): Account[] {
    return this.getAccountsByType(AccountType.REVENUE)
      .concat(this.getAccountsByType(AccountType.EXPENSE));
  }

  /**
   * Validate account code format
   */
  private isValidAccountCode(code?: string): boolean {
    if (!code) return false;
    return /^\d{4}$/.test(code);
  }

  /**
   * Generate unique account ID
   */
  private generateAccountId(code: string): string {
    return `acc_${code}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default normal balance for account type
   */
  private getDefaultNormalBalance(type: AccountType): NormalBalance {
    switch (type) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return NormalBalance.DEBIT;
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        return NormalBalance.CREDIT;
      default:
        return NormalBalance.DEBIT;
    }
  }
}
