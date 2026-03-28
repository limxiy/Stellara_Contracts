import { Injectable } from '@nestjs/common';
import { Account, AccountType, AccountSubtype, JournalEntry, JournalEntryLine } from '../types/accounting.types';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { JournalService } from './journal.service';

/**
 * Financial Statements Service
 * Generates Balance Sheet, Income Statement, and Cash Flow Statement
 */
@Injectable()
export class FinancialStatementsService {
  constructor(
    private chartOfAccounts: ChartOfAccountsService,
    private journal: JournalService,
  ) {}

  /**
   * Generate Balance Sheet
   * Assets = Liabilities + Equity
   */
  generateBalanceSheet(asOfDate: Date, priorPeriodDate?: Date): {
    assets: { current: any[]; nonCurrent: any[]; total: bigint };
    liabilities: { current: any[]; nonCurrent: any[]; total: bigint };
    equity: any[];
    totalEquity: bigint;
    checksBalanced: boolean;
  } {
    const trialBalance = this.journal.getTrialBalance(new Date(0), asOfDate);
    
    // Filter balance sheet accounts
    const balanceSheetAccounts = this.chartOfAccounts.getBalanceSheetAccounts();
    
    // Classify accounts
    const currentAssets = this.getClassifiedAccounts(
      trialBalance,
      balanceSheetAccounts.filter(a => 
        a.type === AccountType.ASSET && 
        [AccountSubtype.CASH, AccountSubtype.BANK, AccountSubtype.ACCOUNTS_RECEIVABLE, AccountSubtype.INVENTORY].includes(a.subtype!)
      ),
    );

    const nonCurrentAssets = this.getClassifiedAccounts(
      trialBalance,
      balanceSheetAccounts.filter(a => 
        a.type === AccountType.ASSET && 
        ![AccountSubtype.CASH, AccountSubtype.BANK, AccountSubtype.ACCOUNTS_RECEIVABLE, AccountSubtype.INVENTORY].includes(a.subtype!)
      ),
    );

    const currentLiabilities = this.getClassifiedAccounts(
      trialBalance,
      balanceSheetAccounts.filter(a => 
        a.type === AccountType.LIABILITY && 
        [AccountSubtype.ACCOUNTS_PAYABLE, AccountSubtype.ACCRUED_EXPENSES, AccountSubtype.DEFERRED_REVENUE].includes(a.subtype!)
      ),
    );

    const nonCurrentLiabilities = this.getClassifiedAccounts(
      trialBalance,
      balanceSheetAccounts.filter(a => 
        a.type === AccountType.LIABILITY && 
        ![AccountSubtype.ACCOUNTS_PAYABLE, AccountSubtype.ACCRUED_EXPENSES, AccountSubtype.DEFERRED_REVENUE].includes(a.subtype!)
      ),
    );

    const equity = this.getClassifiedAccounts(
      trialBalance,
      balanceSheetAccounts.filter(a => a.type === AccountType.EQUITY),
    );

    const totalAssets = currentAssets.reduce((s, x) => s + x.amount, 0n) + nonCurrentAssets.reduce((s, x) => s + x.amount, 0n);
    const totalLiabilities = currentLiabilities.reduce((s, x) => s + x.amount, 0n) + nonCurrentLiabilities.reduce((s, x) => s + x.amount, 0n);
    const totalEquity = equity.reduce((s, x) => s + x.amount, 0n);

    return {
      assets: {
        current: currentAssets,
        nonCurrent: nonCurrentAssets,
        total: totalAssets,
      },
      liabilities: {
        current: currentLiabilities,
        nonCurrent: nonCurrentLiabilities,
        total: totalLiabilities,
      },
      equity,
      totalEquity,
      checksBalanced: totalAssets === (totalLiabilities + totalEquity),
    };
  }

  /**
   * Generate Income Statement
   * Revenue - Expenses = Net Income
   */
  generateIncomeStatement(startDate: Date, endDate: Date, priorPeriodStart?: Date, priorPeriodEnd?: Date): {
    revenue: { operating: any[]; nonOperating: any[]; total: bigint };
    expenses: { cogs: any[]; operating: any[]; other: any[]; total: bigint };
    grossProfit: bigint;
    operatingIncome: bigint;
    netIncome: bigint;
    priorPeriodNetIncome?: bigint;
    growthRate?: number;
  } {
    const trialBalance = this.journal.getTrialBalance(startDate, endDate);
    
    // Revenue accounts
    const revenueAccounts = this.chartOfAccounts.getAccountsByType(AccountType.REVENUE);
    const revenue = this.getClassifiedAccounts(trialBalance, revenueAccounts);
    
    const operatingRevenue = revenue.filter(r => r.subtype === AccountSubtype.OPERATING_REVENUE);
    const nonOperatingRevenue = revenue.filter(r => r.subtype === AccountSubtype.NON_OPERATING_REVENUE);
    const totalRevenue = revenue.reduce((s, x) => s + x.amount, 0n);

    // Expense accounts
    const expenseAccounts = this.chartOfAccounts.getAccountsByType(AccountType.EXPENSE);
    const expenses = this.getClassifiedAccounts(trialBalance, expenseAccounts);
    
    const cogs = expenses.filter(e => e.subtype === AccountSubtype.COST_OF_GOODS_SOLD);
    const operatingExpenses = expenses.filter(e => e.subtype === AccountSubtype.OPERATING_EXPENSE);
    const otherExpenses = expenses.filter(e => 
      [AccountSubtype.DEPRECIATION_EXPENSE, AccountSubtype.INTEREST_EXPENSE, AccountSubtype.TAX_EXPENSE].includes(e.subtype!)
    );

    const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0n);
    const grossProfit = totalRevenue - cogs.reduce((s, x) => s + x.amount, 0n);
    const operatingIncome = grossProfit - operatingExpenses.reduce((s, x) => s + x.amount, 0n);
    const netIncome = totalRevenue - totalExpenses;

    // Prior period comparison if provided
    let priorPeriodNetIncome: bigint | undefined;
    let growthRate: number | undefined;

    if (priorPeriodStart && priorPeriodEnd) {
      const priorTrialBalance = this.journal.getTrialBalance(priorPeriodStart, priorPeriodEnd);
      const priorRevenue = this.getClassifiedAccounts(priorTrialBalance, revenueAccounts);
      const priorExpenses = this.getClassifiedAccounts(priorTrialBalance, expenseAccounts);
      
      priorPeriodNetIncome = priorRevenue.reduce((s, x) => s + x.amount, 0n) - priorExpenses.reduce((s, x) => s + x.amount, 0n);
      
      if (priorPeriodNetIncome > 0n) {
        growthRate = ((Number(netIncome) - Number(priorPeriodNetIncome)) / Number(priorPeriodNetIncome)) * 100;
      }
    }

    return {
      revenue: {
        operating: operatingRevenue,
        nonOperating: nonOperatingRevenue,
        total: totalRevenue,
      },
      expenses: {
        cogs,
        operating: operatingExpenses,
        other: otherExpenses,
        total: totalExpenses,
      },
      grossProfit,
      operatingIncome,
      netIncome,
      priorPeriodNetIncome,
      growthRate,
    };
  }

  /**
   * Generate Cash Flow Statement (Indirect Method)
   */
  generateCashFlowStatement(startDate: Date, endDate: Date): {
    operatingActivities: { netIncome: bigint; adjustments: any[]; net: bigint };
    investingActivities: any[];
    financingActivities: any[];
    netChangeInCash: bigint;
    beginningCashBalance: bigint;
    endingCashBalance: bigint;
  } {
    const incomeStatement = this.generateIncomeStatement(startDate, endDate);
    
    // Start with net income
    const netIncome = incomeStatement.netIncome;
    
    // Add back non-cash items (depreciation, etc.)
    const adjustments: any[] = [];
    
    // Calculate changes in working capital
    // This is simplified - in production, would compare balance sheets
    
    const operatingCashFlow = netIncome + adjustments.reduce((s, x) => s + x.amount, 0n);
    
    // Investing activities (purchase/sale of fixed assets, etc.)
    const investingActivities: any[] = [];
    
    // Financing activities (debt, equity transactions)
    const financingActivities: any[] = [];
    
    const netChangeInCash = operatingCashFlow + investingActivities.reduce((s, x) => x.amount, 0n) + financingActivities.reduce((s, x) => x.amount, 0n);
    
    // Get cash balances
    const cashAccounts = this.chartOfAccounts.getAccountsByType(AccountType.ASSET)
      .filter(a => a.subtype === AccountSubtype.CASH || a.subtype === AccountSubtype.BANK);
    
    const trialBalanceEnd = this.journal.getTrialBalance(new Date(0), endDate);
    const trialBalanceStart = this.journal.getTrialBalance(new Date(0), startDate);
    
    const endingCashBalance = this.sumAccounts(trialBalanceEnd, cashAccounts);
    const beginningCashBalance = this.sumAccounts(trialBalanceStart, cashAccounts);

    return {
      operatingActivities: {
        netIncome,
        adjustments,
        net: operatingCashFlow,
      },
      investingActivities,
      financingActivities,
      netChangeInCash,
      beginningCashBalance,
      endingCashBalance,
    };
  }

  /**
   * Helper: Classify accounts with balances
   */
  private getClassifiedAccounts(trialBalance: any[], accounts: Account[]): Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    subtype?: AccountSubtype;
    amount: bigint;
  }> {
    return accounts.map(account => {
      const line = trialBalance.find(tb => tb.account.id === account.id);
      const amount = line ? BigInt(Math.abs(Number(line.netBalance))) : 0n;
      
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        subtype: account.subtype,
        amount,
      };
    });
  }

  /**
   * Helper: Sum account balances
   */
  private sumAccounts(trialBalance: any[], accounts: Account[]): bigint {
    return accounts.reduce((sum, account) => {
      const line = trialBalance.find(tb => tb.account.id === account.id);
      if (!line) return sum;
      return sum + BigInt(Math.abs(Number(line.netBalance)));
    }, 0n);
  }
}
