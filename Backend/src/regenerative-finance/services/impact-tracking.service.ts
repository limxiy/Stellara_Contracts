import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ImpactTrackingService {
  constructor(private prisma: PrismaService) {}

  async recordImpactMetric(data: {
    publicGoodsProjectId: string;
    metricName: string;
    metricValue: string;
    unit?: string;
    verificationSource?: string;
  }) {
    // Validate project exists
    const project = await this.prisma.publicGoodsProject.findUnique({
      where: { id: data.publicGoodsProjectId },
    });

    if (!project) {
      throw new NotFoundException('Public goods project not found');
    }

    return this.prisma.impactMetric.create({
      data: {
        ...data,
        verified: !!data.verificationSource,
      },
    });
  }

  async verifyMetric(metricId: string, verificationSource: string) {
    return this.prisma.impactMetric.update({
      where: { id: metricId },
      data: {
        verified: true,
        verificationSource,
      },
    });
  }

  async getProjectMetrics(projectId: string) {
    return this.prisma.impactMetric.findMany({
      where: { publicGoodsProjectId: projectId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getMetricHistory(metricName: string, projectId?: string) {
    const whereClause: any = { metricName };
    if (projectId) {
      whereClause.publicGoodsProjectId = projectId;
    }

    return this.prisma.impactMetric.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' },
    });
  }

  async getCumulativeImpact(projectId: string) {
    const metrics = await this.getProjectMetrics(projectId);
    
    const cumulative = metrics.reduce((acc, metric) => {
      if (!acc[metric.metricName]) {
        acc[metric.metricName] = {
          total: 0,
          verified: 0,
          unit: metric.unit,
          lastUpdated: metric.timestamp,
        };
      }
      
      const value = parseFloat(metric.metricValue) || 0;
      acc[metric.metricName].total += value;
      if (metric.verified) {
        acc[metric.metricName].verified += value;
      }
      
      if (metric.timestamp > acc[metric.metricName].lastUpdated) {
        acc[metric.metricName].lastUpdated = metric.timestamp;
      }
      
      return acc;
    }, {});

    return cumulative;
  }

  async getImpactSummary(timeRange?: { start: Date; end: Date }) {
    const whereClause = timeRange
      ? {
          timestamp: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
        }
      : {};

    const metrics = await this.prisma.impactMetric.findMany({
      where: whereClause,
      include: {
        publicGoodsProject: true,
      },
    });

    const summary = {
      totalMetrics: metrics.length,
      verifiedMetrics: metrics.filter(m => m.verified).length,
      uniqueProjects: new Set(metrics.map(m => m.publicGoodsProjectId)).size,
      metricsByCategory: this.groupMetricsByCategory(metrics),
      topMetrics: this.getTopMetrics(metrics),
      verificationRate: metrics.length > 0 
        ? (metrics.filter(m => m.verified).length / metrics.length) * 100 
        : 0,
    };

    return summary;
  }

  async getTopImpactProjects(limit: number = 10) {
    const projects = await this.prisma.publicGoodsProject.findMany({
      include: {
        impactMetrics: true,
        retroactiveFunding: true,
        impactCertificates: true,
      },
    });

    const projectScores = projects.map(project => {
      const metrics = project.impactMetrics;
      const verifiedMetrics = metrics.filter(m => m.verified);
      const totalImpact = metrics.reduce((sum, m) => sum + parseFloat(m.metricValue || '0'), 0);
      const verifiedImpact = verifiedMetrics.reduce((sum, m) => sum + parseFloat(m.metricValue || '0'), 0);
      
      return {
        ...project,
        totalMetrics: metrics.length,
        verifiedMetrics: verifiedMetrics.length,
        totalImpact,
        verifiedImpact,
        verificationRate: metrics.length > 0 ? (verifiedMetrics.length / metrics.length) * 100 : 0,
        fundingReceived: project.retroactiveFunding.reduce((sum, f) => sum + f.fundingAmount, BigInt(0)),
        certificatesIssued: project.impactCertificates.length,
      };
    });

    return projectScores
      .sort((a, b) => b.verifiedImpact - a.verifiedImpact)
      .slice(0, limit);
  }

  private groupMetricsByCategory(metrics: any[]) {
    return metrics.reduce((acc, metric) => {
      const category = metric.publicGoodsProject?.category || 'Unknown';
      if (!acc[category]) {
        acc[category] = {
          total: 0,
          verified: 0,
          uniqueProjects: new Set(),
        };
      }
      acc[category].total += 1;
      if (metric.verified) {
        acc[category].verified += 1;
      }
      acc[category].uniqueProjects.add(metric.publicGoodsProjectId);
      return acc;
    }, {});
  }

  private getTopMetrics(metrics: any[]) {
    const metricCounts = metrics.reduce((acc, metric) => {
      if (!acc[metric.metricName]) {
        acc[metric.metricName] = 0;
      }
      acc[metric.metricName] += 1;
      return acc;
    }, {});

    return Object.entries(metricCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }
}
