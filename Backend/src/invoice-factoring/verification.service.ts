import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async sendVerificationRequest(
    invoiceId: string,
    buyerEmail: string,
    verificationToken: string,
  ): Promise<void> {
    this.logger.log(`Sending verification request for invoice ${invoiceId} to ${buyerEmail}`);

    // In a real implementation, this would send an email
    // For now, we'll just log the verification URL
    const verificationUrl = `${this.configService.get<string>('FRONTEND_URL')}/verify-invoice?token=${verificationToken}&invoiceId=${invoiceId}`;
    
    this.logger.log(`Verification URL: ${verificationUrl}`);
    
    // TODO: Integrate with email service (SendGrid is already installed)
    // await this.emailService.sendVerificationEmail(buyerEmail, verificationUrl, invoiceId);
  }

  async verifyInvoiceToken(invoiceId: string, token: string): Promise<boolean> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.verificationToken !== token) {
      throw new Error('Invalid verification token');
    }

    if (invoice.isVerified) {
      throw new Error('Invoice already verified');
    }

    return true;
  }

  async markInvoiceAsVerified(invoiceId: string, verifiedBy?: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy,
        status: 'VERIFIED',
      },
    });

    this.logger.log(`Invoice ${invoiceId} marked as verified`);
  }
}
