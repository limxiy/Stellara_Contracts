import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { OracleService } from './oracle.service';
import { RiskType } from '@prisma/client';

export interface ParametricAssessmentResult {
  triggered: boolean;
  confidence: number;
  payoutAmount: number;
  assessmentData: any;
}

@Injectable()
export class ParametricAssessmentService {
  private readonly logger = new Logger(ParametricAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oracle: OracleService,
  ) {}

  /**
   * Automatically assess parametric claims based on oracle data
   * @param claimId - The claim to assess
   * @returns Assessment result
   */
  async assessParametricClaim(claimId: string): Promise<ParametricAssessmentResult> {
    try {
      this.logger.log(`Starting parametric assessment for claim: ${claimId}`);

      const claim = await this.prisma.claim.findUnique({
        where: { id: claimId },
        include: {
          policy: true,
        },
      });

      if (!claim) {
        throw new Error(`Claim ${claimId} not found`);
      }

      if (!claim.isParametric) {
        throw new Error(`Claim ${claimId} is not a parametric claim`);
      }

      // Verify parametric trigger condition via oracle
      const triggerData = claim.parametricTriggerData || {};
      const isTriggered = await this.oracle.verifyTriggerCondition(claim.policyId);

      this.logger.log(`Parametric trigger verified: ${isTriggered}`);

      if (isTriggered) {
        // Calculate payout based on policy coverage
        const payoutAmount = claim.policy.coverageAmount.toNumber();
        const confidence = 0.95; // High confidence for parametric claims

        const result: ParametricAssessmentResult = {
          triggered: true,
          confidence,
          payoutAmount,
          assessmentData: {
            triggerVerified: true,
            triggerData,
            assessedAt: new Date(),
            assessmentType: 'PARAMETRIC_AUTOMATED',
          },
        };

        this.logger.log(`Parametric claim assessment completed: ${JSON.stringify(result)}`);
        return result;
      }

      // Trigger not met
      return {
        triggered: false,
        confidence: 0.0,
        payoutAmount: 0,
        assessmentData: {
          triggerVerified: false,
          triggerData,
          assessedAt: new Date(),
          assessmentType: 'PARAMETRIC_AUTOMATED',
        },
      };
    } catch (error) {
      this.logger.error(`Failed to assess parametric claim: ${claimId}`, error.stack);
      throw error;
    }
  }

  /**
   * Create automated parametric claim when trigger is detected
   * @param policyId - Policy ID
   * @returns Created claim or null
   */
  async createParametricClaim(policyId: string): Promise<any | null> {
    try {
      this.logger.log(`Checking parametric trigger for policy: ${policyId}`);

      const isTriggered = await this.oracle.verifyTriggerCondition(policyId);

      if (!isTriggered) {
        this.logger.log(`No parametric trigger detected for policy: ${policyId}`);
        return null;
      }

      const policy = await this.prisma.insurancePolicy.findUnique({
        where: { id: policyId },
      });

      if (!policy || policy.status !== 'ACTIVE') {
        this.logger.warn(`Policy ${policyId} is not active or not found`);
        return null;
      }

      // Create automated parametric claim
      const claim = await this.prisma.claim.create({
        data: {
          policyId,
          poolId: policy.poolId,
          claimAmount: policy.coverageAmount,
          status: 'PENDING',
          isParametric: true,
          currentStage: 'INITIAL_REVIEW',
          submittedAt: new Date(),
        },
        include: {
          policy: true,
        },
      });

      this.logger.log(`Automated parametric claim created: ${claim.id}`);
      return claim;
    } catch (error) {
      this.logger.error(`Failed to create parametric claim for policy: ${policyId}`, error.stack);
      throw error;
    }
  }

  /**
   * Get parametric risk assessment for a given risk type
   * @param riskType - Type of risk
   * @param triggerData - Trigger condition data
   * @returns Risk assessment score and recommendation
   */
  async getParametricRiskAssessment(
    riskType: RiskType,
    triggerData: any,
  ): Promise<{ score: number; recommendation: string }> {
    try {
      this.logger.log(`Assessing parametric risk for: ${riskType}`);

      let score = 0;
      let recommendation = '';

      // Risk-specific assessment logic
      switch (riskType) {
        case RiskType.PARAMETRIC_WEATHER:
          score = this.assessWeatherRisk(triggerData);
          recommendation = score > 0.7 
            ? 'High probability of weather event - approve claim' 
            : 'Insufficient weather data - manual review required';
          break;

        case RiskType.MARKET_VOLATILITY:
          score = this.assessMarketRisk(triggerData);
          recommendation = score > 0.7
            ? 'Market volatility threshold exceeded - approve claim'
            : 'Market conditions within normal range - reject claim';
          break;

        default:
          score = 0.5;
          recommendation = 'Manual assessment required for this risk type';
      }

      return { score, recommendation };
    } catch (error) {
      this.logger.error('Failed to assess parametric risk', error.stack);
      throw error;
    }
  }

  /**
   * Assess weather-related parametric triggers
   */
  private assessWeatherRisk(triggerData: any): number {
    // Implement weather risk assessment logic
    // This would integrate with weather oracle data
    const severity = triggerData.severity || 0;
    const threshold = triggerData.threshold || 0.7;

    return severity >= threshold ? 0.9 : 0.3;
  }

  /**
   * Assess market volatility parametric triggers
   */
  private assessMarketRisk(triggerData: any): number {
    // Implement market risk assessment logic
    // This would integrate with market data oracles
    const volatility = triggerData.volatility || 0;
    const threshold = triggerData.threshold || 10; // 10% volatility

    return volatility >= threshold ? 0.95 : 0.2;
  }
}
