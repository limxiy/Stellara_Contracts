import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CertificateStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ImpactCertificateService {
  constructor(private prisma: PrismaService) {}

  async issueImpactCertificate(data: {
    fundingRoundId: string;
    publicGoodsProjectId: string;
    issuerAddress: string;
    holderAddress: string;
    impactMetrics: any;
    verificationData?: any;
  }) {
    // Validate funding round and project
    const [fundingRound, project] = await Promise.all([
      this.prisma.fundingRound.findUnique({
        where: { id: data.fundingRoundId },
      }),
      this.prisma.publicGoodsProject.findUnique({
        where: { id: data.publicGoodsProjectId },
      }),
    ]);

    if (!fundingRound) {
      throw new NotFoundException('Funding round not found');
    }

    if (!project) {
      throw new NotFoundException('Public goods project not found');
    }

    // Generate unique token ID
    const tokenId = this.generateTokenId();

    return this.prisma.impactCertificate.create({
      data: {
        ...data,
        tokenId,
        status: CertificateStatus.ACTIVE,
        issuedAt: new Date(),
      },
      include: {
        fundingRound: true,
        publicGoodsProject: true,
      },
    });
  }

  async transferCertificate(
    certificateId: string,
    fromAddress: string,
    toAddress: string,
  ) {
    const certificate = await this.prisma.impactCertificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Impact certificate not found');
    }

    if (certificate.holderAddress !== fromAddress) {
      throw new BadRequestException('Not the certificate holder');
    }

    if (certificate.status !== CertificateStatus.ACTIVE) {
      throw new BadRequestException('Certificate is not active');
    }

    return this.prisma.impactCertificate.update({
      where: { id: certificateId },
      data: {
        holderAddress: toAddress,
        status: CertificateStatus.TRANSFERRED,
      },
    });
  }

  async burnCertificate(certificateId: string, holderAddress: string) {
    const certificate = await this.prisma.impactCertificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Impact certificate not found');
    }

    if (certificate.holderAddress !== holderAddress) {
      throw new BadRequestException('Not the certificate holder');
    }

    if (certificate.status !== CertificateStatus.ACTIVE) {
      throw new BadRequestException('Certificate is not active');
    }

    return this.prisma.impactCertificate.update({
      where: { id: certificateId },
      data: { status: CertificateStatus.BURNED },
    });
  }

  async getCertificateByTokenId(tokenId: string) {
    return this.prisma.impactCertificate.findUnique({
      where: { tokenId },
      include: {
        fundingRound: true,
        publicGoodsProject: true,
      },
    });
  }

  async getCertificatesByHolder(holderAddress: string) {
    return this.prisma.impactCertificate.findMany({
      where: { holderAddress },
      include: {
        fundingRound: true,
        publicGoodsProject: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async getCertificatesByProject(projectId: string) {
    return this.prisma.impactCertificate.findMany({
      where: { publicGoodsProjectId: projectId },
      include: {
        fundingRound: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async getCertificatesByRound(roundId: string) {
    return this.prisma.impactCertificate.findMany({
      where: { fundingRoundId: roundId },
      include: {
        publicGoodsProject: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async verifyCertificate(certificateId: string, verificationData: any) {
    const certificate = await this.prisma.impactCertificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Impact certificate not found');
    }

    return this.prisma.impactCertificate.update({
      where: { id: certificateId },
      data: {
        verificationData: {
          ...certificate.verificationData,
          ...verificationData,
          verifiedAt: new Date(),
        },
      },
    });
  }

  async getCertificateStats(holderAddress?: string) {
    const whereClause = holderAddress
      ? { holderAddress }
      : {};

    const certificates = await this.prisma.impactCertificate.findMany({
      where: whereClause,
    });

    const stats = {
      totalCertificates: certificates.length,
      activeCertificates: certificates.filter(c => c.status === CertificateStatus.ACTIVE).length,
      burnedCertificates: certificates.filter(c => c.status === CertificateStatus.BURNED).length,
      transferredCertificates: certificates.filter(c => c.status === CertificateStatus.TRANSFERRED).length,
      certificatesByProject: this.groupCertificatesByProject(certificates),
      certificatesByRound: this.groupCertificatesByRound(certificates),
    };

    return stats;
  }

  async getImpactPortfolio(holderAddress: string) {
    const certificates = await this.prisma.impactCertificate.findMany({
      where: { holderAddress },
      include: {
        publicGoodsProject: true,
        fundingRound: true,
      },
    });

    const portfolio = {
      totalCertificates: certificates.length,
      activeCertificates: certificates.filter(c => c.status === CertificateStatus.ACTIVE),
      impactSummary: this.calculateImpactSummary(certificates),
      projectDiversity: this.calculateProjectDiversity(certificates),
      roundDistribution: this.calculateRoundDistribution(certificates),
    };

    return portfolio;
  }

  async searchCertificates(filters: {
    holderAddress?: string;
    projectId?: string;
    roundId?: string;
    status?: CertificateStatus;
    impactMetric?: string;
  }) {
    const whereClause: any = {};

    if (filters.holderAddress) {
      whereClause.holderAddress = filters.holderAddress;
    }

    if (filters.projectId) {
      whereClause.publicGoodsProjectId = filters.projectId;
    }

    if (filters.roundId) {
      whereClause.fundingRoundId = filters.roundId;
    }

    if (filters.status) {
      whereClause.status = filters.status;
    }

    // For impact metric filtering, we'd need to use raw SQL or complex queries
    // For now, we'll fetch all and filter in memory

    const certificates = await this.prisma.impactCertificate.findMany({
      where: whereClause,
      include: {
        publicGoodsProject: true,
        fundingRound: true,
      },
      orderBy: { issuedAt: 'desc' },
    });

    // Filter by impact metric if specified
    let filteredCertificates = certificates;
    if (filters.impactMetric) {
      filteredCertificates = certificates.filter(c => 
        c.impactMetrics && 
        JSON.stringify(c.impactMetrics).includes(filters.impactMetric)
      );
    }

    return filteredCertificates;
  }

  private generateTokenId(): string {
    // Generate a unique token ID for the NFT
    return `IC-${uuidv4().toUpperCase()}`;
  }

  private groupCertificatesByProject(certificates: any[]) {
    return certificates.reduce((acc, certificate) => {
      const projectId = certificate.publicGoodsProjectId;
      if (!acc[projectId]) {
        acc[projectId] = 0;
      }
      acc[projectId] += 1;
      return acc;
    }, {});
  }

  private groupCertificatesByRound(certificates: any[]) {
    return certificates.reduce((acc, certificate) => {
      const roundId = certificate.fundingRoundId;
      if (!acc[roundId]) {
        acc[roundId] = 0;
      }
      acc[roundId] += 1;
      return acc;
    }, {});
  }

  private calculateImpactSummary(certificates: any[]) {
    const activeCertificates = certificates.filter(c => c.status === CertificateStatus.ACTIVE);
    
    const impactMetrics = activeCertificates.reduce((acc, cert) => {
      if (cert.impactMetrics) {
        Object.entries(cert.impactMetrics).forEach(([key, value]) => {
          if (!acc[key]) {
            acc[key] = { total: 0, count: 0 };
          }
          acc[key].total += Number(value);
          acc[key].count += 1;
        });
      }
      return acc;
    }, {});

    // Calculate averages
    Object.values(impactMetrics).forEach((metric: any) => {
      metric.average = metric.total / metric.count;
    });

    return impactMetrics;
  }

  private calculateProjectDiversity(certificates: any[]) {
    const uniqueProjects = new Set(certificates.map(c => c.publicGoodsProjectId));
    const uniqueCategories = new Set(
      certificates.map(c => c.publicGoodsProject?.category).filter(Boolean)
    );

    return {
      uniqueProjects: uniqueProjects.size,
      uniqueCategories: uniqueCategories.size,
      projectsPerCategory: this.calculateProjectsPerCategory(certificates),
    };
  }

  private calculateRoundDistribution(certificates: any[]) {
    return certificates.reduce((acc, cert) => {
      const roundId = cert.fundingRoundId;
      if (!acc[roundId]) {
        acc[roundId] = 0;
      }
      acc[roundId] += 1;
      return acc;
    }, {});
  }

  private calculateProjectsPerCategory(certificates: any[]) {
    const categoryProjects = certificates.reduce((acc, cert) => {
      const category = cert.publicGoodsProject?.category;
      if (category) {
        if (!acc[category]) {
          acc[category] = new Set();
        }
        acc[category].add(cert.publicGoodsProjectId);
      }
      return acc;
    }, {});

    // Convert Sets to counts
    Object.keys(categoryProjects).forEach(category => {
      categoryProjects[category] = categoryProjects[category].size;
    });

    return categoryProjects;
  }
}
