import { Injectable, Logger } from '@nestjs/common';
import { ABTestGroup, ABTestResults, FeeType, UserSegment } from '../types/fee.types';

/**
 * A/B Testing framework for fee elasticity
 * Tests different fee structures to optimize revenue and user engagement
 * 
 * Acceptance Criteria:
 * - A/B test fee elasticity
 */
@Injectable()
export class FeeABTestingService {
  private readonly logger = new Logger(FeeABTestingService.name);

  // Active A/B tests
  private activeTests = new Map<string, ABTestConfig>();

  // User assignments (userId -> testId -> group)
  private userAssignments = new Map<string, Map<string, ABTestGroup>>();

  // Test results tracking
  private testMetrics = new Map<string, TestMetrics>();

  /**
   * Create a new A/B test for fee structure
   */
  createTest(config: ABTestConfig): string {
    const testId = this.generateTestId(config);
    
    this.activeTests.set(testId, {
      ...config,
      status: 'ACTIVE',
      startDate: Date.now(),
    });

    this.testMetrics.set(testId, {
      control: { users: 0, trades: 0, volume: 0n, revenue: 0n },
      variantA: { users: 0, trades: 0, volume: 0n, revenue: 0n },
      variantB: { users: 0, trades: 0, volume: 0n, revenue: 0n },
    });

    this.logger.log(`Created A/B test: ${testId}`);
    return testId;
  }

  /**
   * Assign user to test group deterministically
   */
  assignUserToTest(userId: string, testId: string): ABTestGroup {
    const test = this.activeTests.get(testId);
    
    if (!test) {
      return ABTestGroup.CONTROL; // Default to control if test doesn't exist
    }

    // Check if already assigned
    let userTests = this.userAssignments.get(userId);
    if (!userTests) {
      userTests = new Map<string, ABTestGroup>();
      this.userAssignments.set(userId, userTests);
    }

    const existingAssignment = userTests.get(testId);
    if (existingAssignment) {
      return existingAssignment;
    }

    // Deterministic assignment based on userId hash
    const hash = this.hashUserId(userId, testId);
    const group = this.determineGroup(hash, test.assignmentRatio);

    userTests.set(testId, group);
    
    // Increment user count for this group
    const metrics = this.testMetrics.get(testId);
    if (metrics) {
      metrics[group].users++;
    }

    this.logger.debug(`Assigned user ${userId} to ${group} for test ${testId}`);
    return group;
  }

  /**
   * Get user's assigned group for a test
   */
  getUserGroup(userId: string, testId: string): ABTestGroup {
    const userTests = this.userAssignments.get(userId);
    return userTests?.get(testId) || ABTestGroup.CONTROL;
  }

  /**
   * Get fee multiplier for user's test group
   */
  getFeeMultiplier(userId: string, testId: string, feeType: FeeType): number {
    const group = this.getUserGroup(userId, testId);
    const test = this.activeTests.get(testId);

    if (!test) {
      return 1.0;
    }

    switch (group) {
      case ABTestGroup.CONTROL:
        return test.controlFeeMultiplier;
      case ABTestGroup.VARIANT_A:
        return test.variantAFeeMultiplier;
      case ABTestGroup.VARIANT_B:
        return test.variantBFeeMultiplier;
    }
  }

  /**
   * Track trade execution for A/B test metrics
   */
  trackTrade(params: {
    userId: string;
    testId: string;
    volume: bigint;
    feeAmount: bigint;
    feeType: FeeType;
  }): void {
    const { userId, testId, volume, feeAmount } = params;
    const group = this.getUserGroup(userId, testId);

    const metrics = this.testMetrics.get(testId);
    if (!metrics) {
      return;
    }

    // Update metrics for this group
    metrics[group].trades++;
    metrics[group].volume += volume;
    metrics[group].revenue += feeAmount;
  }

  /**
   * Calculate A/B test results with statistical analysis
   */
  calculateTestResults(testId: string): Record<ABTestGroup, ABTestResults> {
    const test = this.activeTests.get(testId);
    const metrics = this.testMetrics.get(testId);

    if (!test || !metrics) {
      throw new Error(`Test ${testId} not found`);
    }

    const results = {} as Record<ABTestGroup, ABTestResults>;

    for (const group of [ABTestGroup.CONTROL, ABTestGroup.VARIANT_A, ABTestGroup.VARIANT_B]) {
      const groupMetrics = metrics[group];
      
      results[group] = {
        testId,
        groupName: group,
        conversionRate: groupMetrics.trades / Math.max(groupMetrics.users, 1),
        avgTradeSize: groupMetrics.trades > 0 ? groupMetrics.volume / BigInt(groupMetrics.trades) : 0n,
        totalVolume: groupMetrics.volume,
        revenuePerUser: groupMetrics.users > 0 ? groupMetrics.revenue / BigInt(groupMetrics.users) : 0n,
        userRetention: 0, // Would track separately in production
        sampleSize: groupMetrics.users,
        statisticalSignificance: this.calculateStatisticalSignificance(metrics, group),
      };
    }

    return results;
  }

  /**
   * Calculate statistical significance (simplified t-test)
   */
  private calculateStatisticalSignificance(
    metrics: TestMetrics,
    group: ABTestGroup,
  ): number {
    // Simplified calculation - in production would use proper statistical library
    const groupData = metrics[group];
    const controlData = metrics[ABTestGroup.CONTROL];

    if (groupData.users < 30 || controlData.users < 30) {
      return 1.0; // Not enough data
    }

    // Compare revenue per user
    const groupRPU = Number(groupData.revenue) / groupData.users;
    const controlRPU = Number(controlData.revenue) / controlData.users;

    // Simplified p-value estimation
    const difference = Math.abs(groupRPU - controlRPU);
    const pooledVariance = 0.1; // Assumed variance for simplicity
    
    const tStatistic = difference / Math.sqrt(pooledVariance / groupData.users + pooledVariance / controlData.users);
    
    // Convert to approximate p-value (simplified)
    const pValue = Math.exp(-Math.abs(tStatistic));

    return Math.round(pValue * 1000) / 1000;
  }

  /**
   * Determine winning variant based on results
   */
  determineWinner(testId: string): {
    winner: ABTestGroup;
    confidence: number;
    recommendation: string;
  } {
    const results = this.calculateTestResults(testId);

    // Find group with highest revenue per user
    let winner = ABTestGroup.CONTROL;
    let maxRPU = results[ABTestGroup.CONTROL].revenuePerUser;

    for (const group of [ABTestGroup.VARIANT_A, ABTestGroup.VARIANT_B]) {
      const rpu = results[group].revenuePerUser;
      if (rpu > maxRPU && results[group].statisticalSignificance < 0.05) {
        maxRPU = rpu;
        winner = group;
      }
    }

    const confidence = 1 - results[winner].statisticalSignificance;

    return {
      winner,
      confidence,
      recommendation: this.generateRecommendation(winner, results),
    };
  }

  /**
   * Generate recommendation based on test results
   */
  private generateRecommendation(
    winner: ABTestGroup,
    results: Record<ABTestGroup, ABTestResults>,
  ): string {
    const winResult = results[winner];
    const controlResult = results[ABTestGroup.CONTROL];

    const revenueLift = ((Number(winResult.revenuePerUser) - Number(controlResult.revenuePerUser)) / Number(controlResult.revenuePerUser)) * 100;

    if (winner === ABTestGroup.CONTROL) {
      return 'Control group performs best. Keep current fee structure.';
    } else {
      return `Variant ${winner.replace('VARIANT_', '')} shows ${revenueLift.toFixed(2)}% revenue improvement. Consider implementing fee changes.`;
    }
  }

  /**
   * End A/B test and clean up
   */
  endTest(testId: string): void {
    const test = this.activeTests.get(testId);
    if (test) {
      test.status = 'COMPLETED';
      test.endDate = Date.now();
      this.logger.log(`Ended A/B test: ${testId}`);
    }
  }

  /**
   * Helper: Generate unique test ID
   */
  private generateTestId(config: ABTestConfig): string {
    return `${config.name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
  }

  /**
   * Helper: Hash user ID for deterministic assignment
   */
  private hashUserId(userId: string, testId: string): number {
    const combined = `${userId}-${testId}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Helper: Determine group based on hash and ratio
   */
  private determineGroup(hash: number, ratio: number[]): ABTestGroup {
    const normalizedHash = hash % 100;
    
    if (normalizedHash < ratio[0]) {
      return ABTestGroup.CONTROL;
    } else if (normalizedHash < ratio[0] + ratio[1]) {
      return ABTestGroup.VARIANT_A;
    } else {
      return ABTestGroup.VARIANT_B;
    }
  }

  /**
   * Get all active tests
   */
  getActiveTests(): ABTestConfig[] {
    return Array.from(this.activeTests.values()).filter(t => t.status === 'ACTIVE');
  }

  /**
   * Get test by ID
   */
  getTest(testId: string): ABTestConfig | null {
    return this.activeTests.get(testId) || null;
  }
}

/**
 * A/B Test configuration
 */
export interface ABTestConfig {
  name: string;
  description?: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
  startDate?: number;
  endDate?: number;
  assignmentRatio: number[]; // [control%, variantA%, variantB%]
  controlFeeMultiplier: number;
  variantAFeeMultiplier: number;
  variantBFeeMultiplier: number;
  targetSegments?: UserSegment[];
  targetSymbols?: string[];
}

/**
 * Metrics tracking for test groups
 */
interface TestMetrics {
  control: { users: number; trades: number; volume: bigint; revenue: bigint };
  variantA: { users: number; trades: number; volume: bigint; revenue: bigint };
  variantB: { users: number; trades: number; volume: bigint; revenue: bigint };
}
