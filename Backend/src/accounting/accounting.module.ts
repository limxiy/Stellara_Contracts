import { Module } from '@nestjs/common';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { JournalService } from './services/journal.service';
import { MultiCurrencyService } from './services/multi-currency.service';
import { FinancialStatementsService } from './services/financial-statements.service';

/**
 * Accounting Module - Multi-Ledger Double-Entry System
 * 
 * Features:
 * - Chart of Accounts with hierarchical structure
 * - Double-entry journal engine (Debits = Credits)
 * - Multi-currency support (50+ fiat + crypto)
 * - Financial statement generation (Balance Sheet, Income, Cash Flow)
 * - GAAP/IFRS compliant
 * - Full audit trail
 */
@Module({
  providers: [
    ChartOfAccountsService,
    JournalService,
    MultiCurrencyService,
    FinancialStatementsService,
  ],
  exports: [
    ChartOfAccountsService,
    JournalService,
    MultiCurrencyService,
    FinancialStatementsService,
  ],
})
export class AccountingModule {}
