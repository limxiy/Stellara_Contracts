import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private prisma: PrismaService) {}

  async createAdvancePayment(
    invoiceId: string,
    investorId: string,
    advanceAmount: number,
    transactionHash?: string,
  ) {
    this.logger.log(`Creating advance payment for invoice: ${invoiceId}`);

    return (this.prisma as any).payment.create({
      data: {
        invoiceId,
        type: 'ADVANCE',
        amount: advanceAmount,
        currency: 'USD',
        transactionHash,
        status: 'PENDING',
      },
    });
  }

  async createFullPayment(
    invoiceId: string,
    amount: number,
    transactionHash?: string,
  ) {
    this.logger.log(`Creating full payment for invoice: ${invoiceId}`);

    return (this.prisma as any).payment.create({
      data: {
        invoiceId,
        type: 'FULL_PAYMENT',
        amount,
        currency: 'USD',
        transactionHash,
        status: 'PENDING',
      },
    });
  }

  async processPayment(paymentId: string) {
    this.logger.log(`Processing payment: ${paymentId}`);

    const payment = await (this.prisma as any).payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return (this.prisma as any).payment.update({
      where: { id: paymentId },
      data: {
        status: 'PROCESSING',
        processedAt: new Date(),
      },
    });
  }

  async completePayment(paymentId: string) {
    this.logger.log(`Completing payment: ${paymentId}`);

    const payment = await (this.prisma as any).payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== 'PROCESSING') {
      throw new BadRequestException('Payment must be in processing state');
    }

    return (this.prisma as any).payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
      },
    });
  }

  async failPayment(paymentId: string, reason?: string) {
    this.logger.log(`Failing payment: ${paymentId}, reason: ${reason}`);

    const payment = await (this.prisma as any).payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return (this.prisma as any).payment.update({
      where: { id: paymentId },
      data: {
        status: 'FAILED',
        processedAt: new Date(),
      },
    });
  }

  async getPaymentsByInvoice(invoiceId: string) {
    return (this.prisma as any).payment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPaymentsByInvestor(investorId: string) {
    return (this.prisma as any).payment.findMany({
      where: {
        invoice: {
          bids: {
            some: {
              investorId,
            },
          },
        },
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            amount: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPaymentStatistics(investorId?: string) {
    const where = investorId ? {
      invoice: {
        bids: {
          some: {
            investorId,
          },
        },
      },
    } : {};

    const [
      totalPayments,
      totalAmount,
      completedPayments,
      pendingPayments,
    ] = await Promise.all([
      (this.prisma as any).payment.count({ where }),
      (this.prisma as any).payment.aggregate({
        where,
        _sum: { amount: true },
      }),
      (this.prisma as any).payment.count({
        where: { ...where, status: 'COMPLETED' },
      }),
      (this.prisma as any).payment.count({
        where: { ...where, status: 'PENDING' },
      }),
    ]);

    return {
      totalPayments,
      totalAmount: totalAmount._sum.amount || 0,
      completedPayments,
      pendingPayments,
      completionRate: totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0,
    };
  }
}
