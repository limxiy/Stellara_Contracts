import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  JournalEntry,
  JournalEntryLine,
  EntrySide,
  TransactionStatus,
  CurrencyCode,
  Account,
} from '../types/accounting.types';
import { ChartOfAccountsService } from './chart-of-accounts.service';

/**
 * Double-Entry Journal Service
 * Core engine for recording all financial transactions
 * Ensures: Debits = Credits for every transaction
 */
@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);

  // In-memory storage (in production, use database)
  private entries = new Map<string, JournalEntry>();
  private entryLines = new Map<string, JournalEntryLine[]>();
  private entryNumberCounter = 1;

  constructor(
    private chartOfAccounts: ChartOfAccountsService,
  ) {}

  /**
   * Create a new journal entry with double-entry validation
   */
  createEntry(entryData: {
    transactionDate: Date;
    description: string;
    entryType: string;
    sourceType?: string;
    sourceId?: string;
    lines: Array<{
      accountId: string;
      side: EntrySide;
      amount: bigint;
      currency: CurrencyCode;
      exchangeRate?: number;
      description?: string;
    }>;
    createdBy: string;
    baseCurrency?: CurrencyCode;
  }): JournalEntry {
    const baseCurrency = entryData.baseCurrency || CurrencyCode.USD;

    // Validate debits = credits
    const totalDebits = entryData.lines
      .filter(line => line.side === EntrySide.DEBIT)
      .reduce((sum, line) => sum + line.amount, 0n);

    const totalCredits = entryData.lines
      .filter(line => line.side === EntrySide.CREDIT)
      .reduce((sum, line) => sum + line.amount, 0n);

    if (totalDebits !== totalCredits) {
      throw new BadRequestException(
        `Double-entry violation: Debits (${totalDebits}) ≠ Credits (${totalCredits})`
      );
    }

    // Validate all accounts exist
    for (const line of entryData.lines) {
      const account = this.chartOfAccounts.getAccountById(line.accountId);
      if (!account) {
        throw new BadRequestException(`Account ${line.accountId} not found`);
      }
    }

    // Create entry header
    const entryNumber = this.generateEntryNumber();
    const entry: JournalEntry = {
      id: this.generateEntryId(),
      entryNumber,
      transactionDate: entryData.transactionDate,
      postingDate: entryData.transactionDate,
      status: TransactionStatus.DRAFT,
      entryType: entryData.entryType,
      sourceType: entryData.sourceType,
      sourceId: entryData.sourceId,
      description: entryData.description,
      totalDebits,
      totalCredits,
      baseCurrency,
      createdBy: entryData.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create entry lines
    const lines: JournalEntryLine[] = entryData.lines.map(lineData => ({
      id: this.generateLineId(),
      entryId: entry.id,
      accountId: lineData.accountId,
      side: lineData.side,
      amount: lineData.amount,
      amountBase: this.convertToBaseCurrency(
        lineData.amount,
        lineData.exchangeRate || 1,
      ),
      currency: lineData.currency,
      exchangeRate: lineData.exchangeRate,
      description: lineData.description,
    }));

    // Store in memory
    this.entries.set(entry.id, entry);
    this.entryLines.set(entry.id, lines);

    this.logger.log(
      `Created journal entry ${entryNumber}: ${entryData.description} - ` +
      `Dr: ${totalDebits}, Cr: ${totalCredits}`,
    );

    return entry;
  }

  /**
   * Post a journal entry (make it official)
   */
  postEntry(entryId: string, postedBy: string): JournalEntry {
    const entry = this.entries.get(entryId);
    if (!entry) {
      throw new BadRequestException(`Entry ${entryId} not found`);
    }

    if (entry.status !== TransactionStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot post entry with status ${entry.status}`
      );
    }

    entry.status = TransactionStatus.POSTED;
    entry.postedBy = postedBy;
    entry.postedAt = new Date();
    entry.updatedAt = new Date();

    this.entries.set(entryId, entry);

    this.logger.log(`Posted journal entry ${entry.entryNumber}`);
    return entry;
  }

  /**
   * Reverse a journal entry
   */
  reverseEntry(entryId: string, reversedBy: string, reason?: string): JournalEntry {
    const originalEntry = this.entries.get(entryId);
    if (!originalEntry) {
      throw new BadRequestException(`Entry ${entryId} not found`);
    }

    if (originalEntry.status !== TransactionStatus.POSTED) {
      throw new BadRequestException('Can only reverse posted entries');
    }

    // Create reversing entry
    const originalLines = this.entryLines.get(entryId)!;
    const reversedLines = originalLines.map(line => ({
      accountId: line.accountId,
      side: line.side === EntrySide.DEBIT ? EntrySide.CREDIT : EntrySide.DEBIT,
      amount: line.amount,
      currency: line.currency,
      exchangeRate: line.exchangeRate,
      description: `Reversal: ${line.description || ''}`,
    }));

    const reversalEntry = this.createEntry({
      transactionDate: new Date(),
      description: `Reversal of ${originalEntry.entryNumber}${reason ? ' - ' + reason : ''}`,
      entryType: 'REVERSAL',
      sourceType: originalEntry.entryType,
      sourceId: originalEntry.sourceId,
      lines: reversedLines,
      createdBy: reversedBy,
      baseCurrency: originalEntry.baseCurrency,
    });

    // Post the reversal immediately
    this.postEntry(reversalEntry.id, reversedBy);

    // Mark original as reversed
    originalEntry.status = TransactionStatus.REVERSED;
    originalEntry.reversedBy = reversedBy;
    originalEntry.reversedAt = new Date();
    originalEntry.updatedAt = new Date();

    this.entries.set(entryId, originalEntry);

    this.logger.log(
      `Reversed entry ${originalEntry.entryNumber} with ${reversalEntry.entryNumber}`,
    );

    return originalEntry;
  }

  /**
   * Get entry by ID
   */
  getEntry(entryId: string): JournalEntry | null {
    return this.entries.get(entryId) || null;
  }

  /**
   * Get entry lines
   */
  getEntryLines(entryId: string): JournalEntryLine[] {
    return this.entryLines.get(entryId) || [];
  }

  /**
   * Get full entry with lines
   */
  getFullEntry(entryId: string): { entry: JournalEntry; lines: JournalEntryLine[] } | null {
    const entry = this.getEntry(entryId);
    if (!entry) return null;

    const lines = this.getEntryLines(entryId);
    return { entry, lines };
  }

  /**
   * Get entries by date range
   */
  getEntriesByDateRange(startDate: Date, endDate: Date): JournalEntry[] {
    return Array.from(this.entries.values()).filter(
      entry => entry.transactionDate >= startDate && entry.transactionDate <= endDate,
    );
  }

  /**
   * Get entries by account
   */
  getEntriesByAccount(accountId: string): JournalEntry[] {
    const entryIds = new Set<string>();
    
    for (const [entryId, lines] of this.entryLines.entries()) {
      if (lines.some(line => line.accountId === accountId)) {
        entryIds.add(entryId);
      }
    }

    return Array.from(this.entries.values()).filter(entry => entryIds.has(entry.id));
  }

  /**
   * Get trial balance for a period
   */
  getTrialBalance(startDate: Date, endDate: Date): Array<{
    account: Account;
    debitTotal: bigint;
    creditTotal: bigint;
    netBalance: bigint;
    entryCount: number;
  }> {
    const entries = this.getEntriesByDateRange(startDate, endDate);
    const balances = new Map<string, { debit: bigint; credit: bigint; count: number }>();

    // Aggregate by account
    for (const entry of entries) {
      if (entry.status !== TransactionStatus.POSTED) continue;

      const lines = this.getEntryLines(entry.id);
      for (const line of lines) {
        const existing = balances.get(line.accountId) || { debit: 0n, credit: 0n, count: 0 };
        
        if (line.side === EntrySide.DEBIT) {
          existing.debit += line.amount;
        } else {
          existing.credit += line.amount;
        }
        
        existing.count++;
        balances.set(line.accountId, existing);
      }
    }

    // Build trial balance
    const trialBalance: any[] = [];
    for (const [accountId, totals] of balances.entries()) {
      const account = this.chartOfAccounts.getAccountById(accountId);
      if (!account) continue;

      const netBalance = totals.debit - totals.credit;

      trialBalance.push({
        account,
        debitTotal: totals.debit,
        creditTotal: totals.credit,
        netBalance,
        entryCount: totals.count,
      });
    }

    // Verify trial balance balances
    const totalDebits = trialBalance.reduce((sum, line) => sum + line.debitTotal, 0n);
    const totalCredits = trialBalance.reduce((sum, line) => sum + line.creditTotal, 0n);

    if (totalDebits !== totalCredits) {
      this.logger.error(
        `Trial balance out of balance! Dr: ${totalDebits}, Cr: ${totalCredits}`,
      );
    }

    return trialBalance;
  }

  /**
   * Convert amount to base currency
   */
  private convertToBaseCurrency(amount: bigint, exchangeRate: number): bigint {
    // Simple conversion - in production, handle precision carefully
    return BigInt(Math.round(Number(amount) * exchangeRate));
  }

  /**
   * Generate unique entry ID
   */
  private generateEntryId(): string {
    return `je_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate human-readable entry number
   */
  private generateEntryNumber(): string {
    const year = new Date().getFullYear();
    const number = String(this.entryNumberCounter++).padStart(6, '0');
    return `${year}-${number}`;
  }

  /**
   * Generate line ID
   */
  private generateLineId(): string {
    return `jel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
