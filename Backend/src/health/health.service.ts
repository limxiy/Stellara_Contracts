import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';

type DependencyStatus = 'up' | 'down' | 'degraded';

export interface DependencyReport {
  status: DependencyStatus;
  details?: Record<string, unknown>;
  error?: string;
}

export interface ReadinessReport {
  status: 'ok' | 'error';
  timestamp: string;
  dependencies: Record<string, DependencyReport>;
}

export interface HealthReport extends ReadinessReport {
  runtime: {
    memory: {
      status: DependencyStatus;
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      usagePercent: number;
      heapUsedBytes: number;
    };
    disk: {
      status: DependencyStatus;
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      usagePercent: number;
    };
    uptimeSeconds: number;
  };
}

interface RuntimeResourceHealth {
  status: DependencyStatus;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

interface MemoryHealth extends RuntimeResourceHealth {
  heapUsedBytes: number;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async getReadinessReport(): Promise<ReadinessReport> {
    const [database, redis, stellarRpc, ipfs, sendgrid] = await Promise.all([
      this.checkDatabase(),
      this.checkTcpDependency(
        'REDIS_HOST',
        'REDIS_PORT',
        'redis',
        true,
      ),
      this.checkHttpDependency(this.configService.get<string>('STELLAR_RPC_URL'), 'stellarRpc'),
      this.checkIpfs(),
      this.checkSendGrid(),
    ]);

    const dependencies = { database, redis, stellarRpc, ipfs, sendgrid };
    const hasFailure = Object.values(dependencies).some((item) => item.status === 'down');

    return {
      status: hasFailure ? 'error' : 'ok',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  async getHealthReport(): Promise<HealthReport> {
    const readiness = await this.getReadinessReport();
    return {
      ...readiness,
      runtime: {
        memory: this.getMemoryHealth(),
        disk: this.getDiskHealth(),
        uptimeSeconds: Math.round(process.uptime()),
      },
    };
  }

  private async checkDatabase(): Promise<DependencyReport> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }

  private async checkIpfs(): Promise<DependencyReport> {
    const host = this.configService.get<string>('IPFS_HOST');
    const port = this.configService.get<number>('IPFS_PORT');

    if (!host || !port) {
      return {
        status: 'degraded',
        details: { configured: false },
      };
    }

    return this.checkTcpConnection(host, port, 'ipfs');
  }

  private async checkSendGrid(): Promise<DependencyReport> {
    const emailEnabled = this.configService.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED', false);
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL');

    if (!emailEnabled) {
      return {
        status: 'degraded',
        details: { configured: false, enabled: false },
      };
    }

    if (!apiKey || !fromEmail) {
      return {
        status: 'down',
        error: 'Email notifications are enabled but SendGrid is not fully configured',
      };
    }

    return {
      status: 'up',
      details: {
        configured: true,
        fromEmail,
      },
    };
  }

  private async checkTcpDependency(
    hostKey: string,
    portKey: string,
    name: string,
    required = false,
  ): Promise<DependencyReport> {
    const host = this.configService.get<string>(hostKey);
    const port = this.configService.get<number>(portKey);

    if (!host || !port) {
      return {
        status: required ? 'down' : 'degraded',
        details: { configured: false },
      };
    }

    return this.checkTcpConnection(host, port, name);
  }

  private async checkHttpDependency(
    url: string | undefined,
    name: string,
  ): Promise<DependencyReport> {
    if (!url) {
      return {
        status: 'down',
        details: { configured: false },
      };
    }

    const timeoutMs = this.configService.get<number>('HTTP_REQUEST_TIMEOUT_MS', 5000);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return {
        status: response.ok ? 'up' : 'down',
        details: {
          name,
          statusCode: response.status,
        },
      };
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }

  private checkTcpConnection(host: string, port: number, name: string): Promise<DependencyReport> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      const finalize = (report: DependencyReport) => {
        socket.destroy();
        resolve({
          ...report,
          details: {
            name,
            host,
            port,
            ...(report.details ?? {}),
          },
        });
      };

      socket.setTimeout(5000);
      socket.once('connect', () => finalize({ status: 'up' }));
      socket.once('timeout', () =>
        finalize({ status: 'down', error: `${name} connection timed out` }),
      );
      socket.once('error', (error) => finalize({ status: 'down', error: error.message }));
      socket.connect(port, host);
    });
  }

  private getMemoryHealth(): MemoryHealth {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      status: free / total > 0.1 ? 'up' : 'degraded',
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usagePercent: Number(((used / total) * 100).toFixed(2)),
      heapUsedBytes: process.memoryUsage().heapUsed,
    };
  }

  private getDiskHealth(): RuntimeResourceHealth {
    const stats = fs.statfsSync(process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - freeBytes;

    return {
      status: freeBytes / totalBytes > 0.1 ? 'up' : 'degraded',
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent: Number(((usedBytes / totalBytes) * 100).toFixed(2)),
    };
  }
}
