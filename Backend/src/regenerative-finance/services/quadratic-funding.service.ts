import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { 
  FundingRoundType, 
  FundingRoundStatus, 
  ProjectParticipationStatus 
} from '@prisma/client';

@Injectable()
export class QuadraticFundingService {
  constructor(private prisma: PrismaService) {}

  async createFundingRound(data: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    matchingPool?: bigint;
    metadata?: any;
  }) {
    return this.prisma.fundingRound.create({
      data: {
        ...data,
        type: FundingRoundType.QUADRATIC,
        status: FundingRoundStatus.UPCOMING,
        matchingPool: data.matchingPool || BigInt(0),
      },
      include: {
        projects: {
          include: {
            publicGoodsProject: true,
          },
        },
        contributions: {
          include: {
            publicGoodsProject: true,
          },
        },
      },
    });
  }

  async startFundingRound(roundId: string) {
    const round = await this.prisma.fundingRound.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      throw new NotFoundException('Funding round not found');
    }

    if (round.status !== FundingRoundStatus.UPCOMING) {
      throw new BadRequestException('Only upcoming rounds can be started');
    }

    if (new Date() < round.startTime) {
      throw new BadRequestException('Cannot start round before start time');
    }

    return this.prisma.fundingRound.update({
      where: { id: roundId },
      data: { status: FundingRoundStatus.ACTIVE },
    });
  }

  async endFundingRound(roundId: string) {
    const round = await this.prisma.fundingRound.findUnique({
      where: { id: roundId },
      include: {
        projects: {
          include: {
            contributions: true,
          },
        },
      },
    });

    if (!round) {
      throw new NotFoundException('Funding round not found');
    }

    if (round.status !== FundingRoundStatus.ACTIVE) {
      throw new BadRequestException('Only active rounds can be ended');
    }

    // Calculate quadratic matching for each project
    const matchingResults = await this.calculateQuadraticMatching(roundId);

    // Update project totals and matching amounts
    await Promise.all(
      matchingResults.map(async (result) => {
        await this.prisma.fundingRoundProject.update({
          where: { id: result.projectId },
          data: {
            totalContributions: result.totalContributions,
            matchedAmount: result.matchedAmount,
            uniqueContributors: result.uniqueContributors,
          },
        });
      }),
    );

    // Update round totals
    const totalMatched = matchingResults.reduce(
      (sum, result) => sum + result.matchedAmount,
      BigInt(0),
    );

    return this.prisma.fundingRound.update({
      where: { id: roundId },
      data: {
        status: FundingRoundStatus.COMPLETED,
        totalMatched,
        totalContributions: matchingResults.reduce(
          (sum, result) => sum + result.totalContributions,
          BigInt(0),
        ),
      },
    });
  }

  async addProjectToRound(roundId: string, projectId: string) {
    // Check if project exists in public goods projects
    const publicGoodsProject = await this.prisma.publicGoodsProject.findUnique({
      where: { id: projectId },
    });

    if (!publicGoodsProject) {
      throw new NotFoundException('Public goods project not found');
    }

    // Check if project is already in the round
    const existing = await this.prisma.fundingRoundProject.findUnique({
      where: {
        fundingRoundId_publicGoodsProjectId: {
          fundingRoundId: roundId,
          publicGoodsProjectId: projectId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Project already added to this round');
    }

    return this.prisma.fundingRoundProject.create({
      data: {
        fundingRoundId: roundId,
        publicGoodsProjectId: projectId,
        status: ProjectParticipationStatus.APPROVED,
      },
      include: {
        publicGoodsProject: true,
        fundingRound: true,
      },
    });
  }

  async contributeToProject(data: {
    fundingRoundId: string;
    publicGoodsProjectId: string;
    contributorAddress: string;
    amount: bigint;
    transactionHash: string;
    voiceCredits?: bigint;
  }) {
    // Validate round is active
    const round = await this.prisma.fundingRound.findUnique({
      where: { id: data.fundingRoundId },
    });

    if (!round || round.status !== FundingRoundStatus.ACTIVE) {
      throw new BadRequestException('Round is not active for contributions');
    }

    if (new Date() > round.endTime) {
      throw new BadRequestException('Round has ended');
    }

    // Check if project is in the round
    const projectInRound = await this.prisma.fundingRoundProject.findUnique({
      where: {
        fundingRoundId_publicGoodsProjectId: {
          fundingRoundId: data.fundingRoundId,
          publicGoodsProjectId: data.publicGoodsProjectId,
        },
      },
    });

    if (!projectInRound) {
      throw new NotFoundException('Project not found in this round');
    }

    // Create contribution
    const contribution = await this.prisma.quadraticContribution.create({
      data: {
        ...data,
        voiceCredits: data.voiceCredits || BigInt(0),
        timestamp: new Date(),
      },
    });

    // Update project contribution totals
    await this.updateProjectContributionTotals(data.publicGoodsProjectId);

    return contribution;
  }

  async calculateQuadraticMatching(roundId: string) {
    const projects = await this.prisma.fundingRoundProject.findMany({
      where: { fundingRoundId: roundId },
      include: {
        contributions: true,
      },
    });

    const round = await this.prisma.fundingRound.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      throw new NotFoundException('Funding round not found');
    }

    const matchingPool = round.matchingPool;
    const results = [];

    for (const project of projects) {
      const contributions = project.contributions;
      const uniqueContributors = new Set(
        contributions.map(c => c.contributorAddress),
      ).size;
      
      const totalContributions = contributions.reduce(
        (sum, c) => sum + c.amount,
        BigInt(0),
      );

      // Quadratic matching formula: sqrt(sum of squares of contributions)
      const sumOfSquares = contributions.reduce(
        (sum, c) => sum + (c.amount * c.amount),
        BigInt(0),
      );

      const sqrtSumOfSquares = this.bigIntSqrt(sumOfSquares);
      results.push({
        projectId: project.id,
        totalContributions,
        uniqueContributors,
        sqrtSumOfSquares,
        matchedAmount: BigInt(0), // Will be calculated after all projects are processed
      });
    }

    // Calculate proportional matching based on sqrt sums
    const totalSqrtSum = results.reduce(
      (sum, r) => sum + r.sqrtSumOfSquares,
      BigInt(0),
    );

    if (totalSqrtSum > BigInt(0)) {
      for (const result of results) {
        result.matchedAmount = (result.sqrtSumOfSquares * matchingPool) / totalSqrtSum;
      }
    }

    return results;
  }

  private async updateProjectContributionTotals(projectId: string) {
    const contributions = await this.prisma.quadraticContribution.findMany({
      where: { publicGoodsProjectId: projectId },
    });

    const totalContributions = contributions.reduce(
      (sum, c) => sum + c.amount,
      BigInt(0),
    );

    const uniqueContributors = new Set(
      contributions.map(c => c.contributorAddress),
    ).size;

    await this.prisma.fundingRoundProject.updateMany({
      where: { publicGoodsProjectId: projectId },
      data: {
        totalContributions,
        uniqueContributors,
      },
    });
  }

  private bigIntSqrt(value: bigint): bigint {
    if (value < BigInt(0)) {
      throw new Error('Cannot calculate square root of negative number');
    }
    
    if (value === BigInt(0)) return BigInt(0);
    
    let x = value;
    let y = (x + BigInt(1)) / BigInt(2);
    
    while (y < x) {
      x = y;
      y = (x + value / x) / BigInt(2);
    }
    
    return x;
  }

  async getFundingRound(roundId: string) {
    return this.prisma.fundingRound.findUnique({
      where: { id: roundId },
      include: {
        projects: {
          include: {
            publicGoodsProject: true,
            contributions: true,
          },
        },
        contributions: {
          include: {
            publicGoodsProject: true,
          },
        },
      },
    });
  }

  async getActiveFundingRounds() {
    return this.prisma.fundingRound.findMany({
      where: { status: FundingRoundStatus.ACTIVE },
      include: {
        projects: {
          include: {
            publicGoodsProject: true,
          },
        },
      },
      orderBy: { endTime: 'asc' },
    });
  }

  async getFundingRoundResults(roundId: string) {
    const round = await this.prisma.fundingRound.findUnique({
      where: { id: roundId },
      include: {
        projects: {
          include: {
            publicGoodsProject: true,
            contributions: {
              orderBy: { timestamp: 'desc' },
            },
          },
        },
      },
    });

    if (!round) {
      throw new NotFoundException('Funding round not found');
    }

    return {
      ...round,
      matchingResults: await this.calculateQuadraticMatching(roundId),
    };
  }
}
