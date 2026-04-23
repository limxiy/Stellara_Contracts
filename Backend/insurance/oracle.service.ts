import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { RiskType } from '@prisma/client';

export interface OracleData {
  value: number;
  timestamp: number;
  signature?: string;
}

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetches data from an external oracle provider.
   * In a real implementation, this would call Chainlink or a custom API.
   */
  async getExternalData(riskType: RiskType, location?: string): Promise<OracleData> {
    this.logger.log(`Fetching oracle data for ${riskType} at ${location || 'global'}`);

    // Mocking external call
    // For PARAMETRIC_WEATHER, we might fetch rainfall or wind speed
    if (riskType === 'PARAMETRIC_WEATHER') {
      return {
        value: Math.random() * 100, // e.g., mm of rain
        timestamp: Date.now(),
      };
    }

    return {
      value: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Verifies if the oracle data triggers a claim condition.
   */
  async verifyTriggerCondition(policyId: string): Promise<boolean> {
    const policy = await this.prisma.insurancePolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) return false;

    const oracleData = await this.getExternalData(policy.riskType);

    // Parametric trigger logic
    if (policy.riskType === 'PARAMETRIC_WEATHER') {
      const threshold = 80; // mm of rain
      return oracleData.value > threshold;
    }

    return false;
  }
}
