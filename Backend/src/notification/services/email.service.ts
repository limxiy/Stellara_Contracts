import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly emailEnabled: boolean;
  private readonly sendGridApiKey?: string;
  private readonly fromEmail: string;
  private readonly outboxAlertThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.emailEnabled = this.configService.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED', false);
    this.sendGridApiKey = this.configService.get<string>('SENDGRID_API_KEY');
    this.fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL', 'noreply@novafund.xyz');
    this.outboxAlertThreshold = this.configService.get<number>('EMAIL_OUTBOX_ALERT_THRESHOLD', 25);
  }

  onModuleInit() {
    if (this.emailEnabled && !this.sendGridApiKey) {
      throw new Error('SENDGRID_API_KEY is required when EMAIL_NOTIFICATIONS_ENABLED is true');
    }

    if (this.sendGridApiKey) {
      sgMail.setApiKey(this.sendGridApiKey);
      // Configure timeout for SendGrid API calls
      const sendGridTimeout = this.configService.get<number>('SENDGRID_TIMEOUT_MS', 15000);
      sgMail.setTimeout(sendGridTimeout);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.emailEnabled) {
      this.logger.debug(`Email notifications disabled. Skipping email to ${to}.`);
      return;
    }

    if (!this.sendGridApiKey) {
      const error = new Error('SENDGRID_API_KEY not configured');
      await this.recordFailure(to, subject, html, error.message);
      this.logger.error(`Email delivery blocked for ${to}: ${error.message}`);
      throw error;
    }

    try {
      await sgMail.send({
        to,
        from: this.fromEmail,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      await this.recordFailure(to, subject, html, error.message);
      throw error;
    }
  }

  async recordFailure(to: string, subject: string, html: string, reason: string): Promise<void> {
    await this.prisma.emailOutbox.create({
      data: {
        to,
        subject,
        html,
        status: 'FAILED',
        lastError: reason,
      },
    });

    await this.checkOutboxAlertThreshold();
  }

  async checkOutboxAlertThreshold(): Promise<void> {
    const failedCount = await this.prisma.emailOutbox.count({
      where: { status: 'FAILED' },
    });

    if (failedCount >= this.outboxAlertThreshold) {
      this.logger.error(
        `Email outbox threshold exceeded: ${failedCount} failed emails pending investigation`,
      );
    }
  }

  getEmailConfigStatus() {
    return {
      enabled: this.emailEnabled,
      configured: Boolean(this.sendGridApiKey),
      fromEmail: this.fromEmail,
      outboxAlertThreshold: this.outboxAlertThreshold,
    };
  }
}
