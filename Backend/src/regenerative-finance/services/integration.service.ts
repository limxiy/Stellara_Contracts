import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { IntegrationPlatform } from '@prisma/client';

@Injectable()
export class IntegrationService {
  constructor(private prisma: PrismaService) {}

  async configureIntegration(data: {
    platform: IntegrationPlatform;
    config: any;
  }) {
    const existing = await this.prisma.integrationConfig.findUnique({
      where: { platform: data.platform },
    });

    if (existing) {
      return this.prisma.integrationConfig.update({
        where: { platform: data.platform },
        data: {
          config: data.config,
          isActive: true,
        },
      });
    }

    return this.prisma.integrationConfig.create({
      data: {
        ...data,
        isActive: true,
      },
    });
  }

  async getIntegrationConfig(platform: IntegrationPlatform) {
    const config = await this.prisma.integrationConfig.findUnique({
      where: { platform },
    });

    if (!config || !config.isActive) {
      throw new NotFoundException(`Integration for ${platform} not found or inactive`);
    }

    return config;
  }

  async syncWithGitcoin() {
    const config = await this.getIntegrationConfig(IntegrationPlatform.GITCOIN);
    
    try {
      // Implementation for Gitcoin sync
      const projects = await this.fetchGitcoinProjects(config.config);
      const syncedProjects = [];

      for (const project of projects) {
        const publicGoodsProject = await this.syncGitcoinProject(project);
        if (publicGoodsProject) {
          syncedProjects.push(publicGoodsProject);
        }
      }

      await this.prisma.integrationConfig.update({
        where: { platform: IntegrationPlatform.GITCOIN },
        data: { lastSyncAt: new Date() },
      });

      return {
        syncedProjects: syncedProjects.length,
        projects: syncedProjects,
      };
    } catch (error) {
      throw new BadRequestException(`Gitcoin sync failed: ${error.message}`);
    }
  }

  async syncWithClrFund() {
    const config = await this.getIntegrationConfig(IntegrationPlatform.CLR_FUND);
    
    try {
      // Implementation for clr.fund sync
      const rounds = await this.fetchClrFundRounds(config.config);
      const syncedRounds = [];

      for (const round of rounds) {
        const fundingRound = await this.syncClrFundRound(round);
        if (fundingRound) {
          syncedRounds.push(fundingRound);
        }
      }

      await this.prisma.integrationConfig.update({
        where: { platform: IntegrationPlatform.CLR_FUND },
        data: { lastSyncAt: new Date() },
      });

      return {
        syncedRounds: syncedRounds.length,
        rounds: syncedRounds,
      };
    } catch (error) {
      throw new BadRequestException(`clr.fund sync failed: ${error.message}`);
    }
  }

  async importGithubProjects(githubToken: string, organization?: string) {
    try {
      const projects = await this.fetchGithubProjects(githubToken, organization);
      const importedProjects = [];

      for (const project of projects) {
        const publicGoodsProject = await this.importGithubProject(project);
        if (publicGoodsProject) {
          importedProjects.push(publicGoodsProject);
        }
      }

      return {
        importedProjects: importedProjects.length,
        projects: importedProjects,
      };
    } catch (error) {
      throw new BadRequestException(`GitHub import failed: ${error.message}`);
    }
  }

  async getIntegrationStatus() {
    const integrations = await this.prisma.integrationConfig.findMany({
      orderBy: { lastSyncAt: 'desc' },
    });

    return integrations.map(integration => ({
      platform: integration.platform,
      isActive: integration.isActive,
      lastSyncAt: integration.lastSyncAt,
      configKeys: Object.keys(integration.config),
    }));
  }

  async disableIntegration(platform: IntegrationPlatform) {
    return this.prisma.integrationConfig.update({
      where: { platform },
      data: { isActive: false },
    });
  }

  async enableIntegration(platform: IntegrationPlatform) {
    return this.prisma.integrationConfig.update({
      where: { platform },
      data: { isActive: true },
    });
  }

  private async fetchGitcoinProjects(config: any) {
    // Mock implementation - replace with actual Gitcoin API calls
    // This would typically use the Gitcoin Grants API
    return [
      {
        id: 'gitcoin-1',
        title: 'Open Source Climate Tools',
        description: 'Building open source tools for climate action',
        category: 'Climate',
        walletAddress: '0x123...',
        metadata: {
          gitcoinId: '123',
          tags: ['climate', 'open-source', 'tools'],
        },
      },
      {
        id: 'gitcoin-2',
        title: 'DeFi Education Platform',
        description: 'Educational resources for DeFi adoption',
        category: 'Education',
        walletAddress: '0x456...',
        metadata: {
          gitcoinId: '456',
          tags: ['education', 'defi', 'resources'],
        },
      },
    ];
  }

  private async syncGitcoinProject(gitcoinProject: any) {
    // Check if project already exists
    const existing = await this.prisma.publicGoodsProject.findFirst({
      where: {
        walletAddress: gitcoinProject.walletAddress,
      },
    });

    if (existing) {
      // Update existing project
      return this.prisma.publicGoodsProject.update({
        where: { id: existing.id },
        data: {
          title: gitcoinProject.title,
          description: gitcoinProject.description,
          category: gitcoinProject.category,
          verificationData: {
            ...existing.verificationData,
            gitcoin: {
              id: gitcoinProject.id,
              syncedAt: new Date().toISOString(),
              metadata: gitcoinProject.metadata,
            },
          },
        },
      });
    }

    // Create new project
    return this.prisma.publicGoodsProject.create({
      data: {
        title: gitcoinProject.title,
        description: gitcoinProject.description,
        category: gitcoinProject.category,
        walletAddress: gitcoinProject.walletAddress,
        verificationData: {
          gitcoin: {
            id: gitcoinProject.id,
            syncedAt: new Date().toISOString(),
            metadata: gitcoinProject.metadata,
          },
        },
      },
    });
  }

  private async fetchClrFundRounds(config: any) {
    // Mock implementation - replace with actual clr.fund API calls
    return [
      {
        id: 'clr-round-1',
        title: 'Q1 2024 Public Goods Round',
        description: 'Quarterly funding round for public goods',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-03-31'),
        matchingPool: BigInt('1000000000000000000'), // 1 ETH
        metadata: {
          clrFundId: 'round-123',
          type: 'quadratic',
        },
      },
    ];
  }

  private async syncClrFundRound(clrRound: any) {
    // Check if round already exists
    const existing = await this.prisma.fundingRound.findFirst({
      where: {
        title: clrRound.title,
      },
    });

    if (existing) {
      return existing;
    }

    // Create new funding round
    return this.prisma.fundingRound.create({
      data: {
        title: clrRound.title,
        description: clrRound.description,
        startTime: clrRound.startTime,
        endTime: clrRound.endTime,
        matchingPool: clrRound.matchingPool,
        metadata: {
          ...clrRound.metadata,
          clrFund: {
            id: clrRound.id,
            syncedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  private async fetchGithubProjects(token: string, organization?: string) {
    // Mock implementation - replace with actual GitHub API calls
    return [
      {
        id: 'github-1',
        name: 'awesome-climate-tools',
        description: 'A curated list of awesome climate tools and resources',
        category: 'Climate',
        owner: {
          login: 'climate-org',
        },
        topics: ['climate', 'tools', 'open-source'],
        stars: 1234,
        forks: 567,
        metadata: {
          githubId: 'repo-123',
          organization: organization || 'climate-org',
        },
      },
    ];
  }

  private async importGithubProject(githubProject: any) {
    // Generate a mock wallet address for the project
    const walletAddress = `0x${githubProject.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 38).padEnd(38, '0')}`;

    // Check if project already exists
    const existing = await this.prisma.publicGoodsProject.findFirst({
      where: {
        title: githubProject.name,
      },
    });

    if (existing) {
      // Update existing project
      return this.prisma.publicGoodsProject.update({
        where: { id: existing.id },
        data: {
          description: githubProject.description,
          verificationData: {
            ...existing.verificationData,
            github: {
              id: githubProject.id,
              owner: githubProject.owner.login,
              stars: githubProject.stars,
              forks: githubProject.forks,
              topics: githubProject.topics,
              syncedAt: new Date().toISOString(),
              metadata: githubProject.metadata,
            },
          },
        },
      });
    }

    // Create new project
    return this.prisma.publicGoodsProject.create({
      data: {
        title: githubProject.name,
        description: githubProject.description,
        category: githubProject.category,
        walletAddress,
        verificationData: {
          github: {
            id: githubProject.id,
            owner: githubProject.owner.login,
            stars: githubProject.stars,
            forks: githubProject.forks,
            topics: githubProject.topics,
            syncedAt: new Date().toISOString(),
            metadata: githubProject.metadata,
          },
        },
      },
    });
  }
}
