import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateInvoiceDto, OcrExtractedDataDto } from './dto/create-invoice.dto';
import { FileUploadService } from './file-upload.service';
import { OcrService } from './ocr.service';
import { VerificationService } from './verification.service';
import { InvoiceStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private prisma: PrismaService,
    private fileUploadService: FileUploadService,
    private ocrService: OcrService,
    private verificationService: VerificationService,
  ) {}

  async createInvoice(
    sellerId: string,
    createInvoiceDto: CreateInvoiceDto,
    file?: Express.Multer.File,
  ) {
    this.logger.log(`Creating invoice for seller: ${sellerId}`);

    let ocrData: OcrExtractedDataDto | null = null;
    let pdfUrl: string | null = null;

    // Process uploaded file if provided
    if (file) {
      this.fileUploadService.validateFile(file);
      pdfUrl = this.fileUploadService.getFileUrl(file.filename);

      try {
        // Extract data using OCR
        ocrData = await this.ocrService.extractInvoiceData(file.path);
        
        // Validate extracted data
        const validation = await this.ocrService.validateExtractedData(ocrData);
        if (!validation.isValid) {
          this.logger.warn(`OCR validation failed. Missing fields: ${validation.missingFields.join(', ')}`);
        }

        // Merge OCR data with user input (prefer user input)
        createInvoiceDto = this.mergeInvoiceData(createInvoiceDto, ocrData);
      } catch (error) {
        this.logger.error(`OCR processing failed: ${error.message}`);
        // Continue with user-provided data if OCR fails
      }

      // Cleanup temp file
      await this.ocrService.cleanupTempFile(file.path);
    }

    // Generate verification token
    const verificationToken = uuidv4();

    try {
      const invoice = await this.prisma.invoice.create({
        data: {
          sellerId,
          invoiceNumber: createInvoiceDto.invoiceNumber,
          buyerName: createInvoiceDto.buyerName,
          buyerEmail: createInvoiceDto.buyerEmail,
          buyerAddress: createInvoiceDto.buyerAddress,
          amount: createInvoiceDto.amount,
          currency: createInvoiceDto.currency || 'USD',
          issueDate: createInvoiceDto.issueDate,
          dueDate: createInvoiceDto.dueDate,
          description: createInvoiceDto.description,
          pdfUrl,
          ocrData: ocrData ? JSON.stringify(ocrData) : null,
          verificationToken,
          status: InvoiceStatus.PENDING_VERIFICATION,
        },
      });

      // Send verification request to buyer
      if (createInvoiceDto.buyerEmail) {
        await this.verificationService.sendVerificationRequest(
          invoice.id,
          createInvoiceDto.buyerEmail,
          verificationToken,
        );
      }

      this.logger.log(`Invoice created successfully: ${invoice.id}`);
      return invoice;

    } catch (error) {
      this.logger.error(`Failed to create invoice: ${error.message}`);
      throw new BadRequestException(`Failed to create invoice: ${error.message}`);
    }
  }

  async getInvoiceById(invoiceId: string, userId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        seller: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
          },
        },
        auction: {
          include: {
            bids: {
              include: {
                investor: {
                  select: {
                    id: true,
                    walletAddress: true,
                    reputationScore: true,
                  },
                },
              },
            },
          },
        },
        payments: true,
        defaultClaims: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Check access permissions
    if (userId && invoice.sellerId !== userId) {
      // Investors can see invoices in active auctions
      const hasAccess = invoice.auction?.status === 'ACTIVE';
      if (!hasAccess) {
        throw new BadRequestException('Access denied');
      }
    }

    return invoice;
  }

  async getInvoicesBySeller(sellerId: string, status?: InvoiceStatus) {
    const where: any = { sellerId };
    if (status) {
      where.status = status;
    }

    return this.prisma.invoice.findMany({
      where,
      include: {
        auction: {
          include: {
            bids: {
              include: {
                investor: {
                  select: {
                    id: true,
                    walletAddress: true,
                  },
                },
              },
            },
          },
        },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAvailableInvoices(investorId: string) {
    return this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.IN_AUCTION,
        sellerId: { not: investorId }, // Exclude seller's own invoices
      },
      include: {
        seller: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
          },
        },
        auction: {
          include: {
            bids: {
              include: {
                investor: {
                  select: {
                    id: true,
                    walletAddress: true,
                    reputationScore: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status },
    });
  }

  async verifyInvoice(invoiceId: string, token: string): Promise<boolean> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.verificationToken !== token) {
      throw new BadRequestException('Invalid verification token');
    }

    if (invoice.isVerified) {
      throw new BadRequestException('Invoice already verified');
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        status: InvoiceStatus.VERIFIED,
      },
    });

    this.logger.log(`Invoice verified: ${invoiceId}`);
    return true;
  }

  private mergeInvoiceData(
    userInput: CreateInvoiceDto,
    ocrData: OcrExtractedDataDto,
  ): CreateInvoiceDto {
    const merged = { ...userInput };

    // Only use OCR data if user didn't provide the field
    if (!merged.invoiceNumber && ocrData.invoiceNumber) {
      merged.invoiceNumber = ocrData.invoiceNumber;
    }

    if (!merged.buyerName && ocrData.buyerName) {
      merged.buyerName = ocrData.buyerName;
    }

    if (!merged.buyerEmail && ocrData.buyerEmail) {
      merged.buyerEmail = ocrData.buyerEmail;
    }

    if (!merged.amount && ocrData.amount) {
      merged.amount = ocrData.amount;
    }

    if (!merged.issueDate && ocrData.issueDate) {
      merged.issueDate = ocrData.issueDate;
    }

    if (!merged.dueDate && ocrData.dueDate) {
      merged.dueDate = ocrData.dueDate;
    }

    if (!merged.description && ocrData.description) {
      merged.description = ocrData.description;
    }

    return merged;
  }

  async getInvoiceStatistics(sellerId?: string) {
    const where = sellerId ? { sellerId } : {};

    const [
      totalInvoices,
      totalAmount,
      verifiedInvoices,
      fundedInvoices,
      completedInvoices,
    ] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.invoice.count({
        where: { ...where, isVerified: true },
      }),
      this.prisma.invoice.count({
        where: { ...where, status: InvoiceStatus.FUNDED },
      }),
      this.prisma.invoice.count({
        where: { ...where, status: InvoiceStatus.COMPLETED },
      }),
    ]);

    return {
      totalInvoices,
      totalAmount: totalAmount._sum.amount || 0,
      verifiedInvoices,
      fundedInvoices,
      completedInvoices,
      verificationRate: totalInvoices > 0 ? (verifiedInvoices / totalInvoices) * 100 : 0,
      fundingRate: verifiedInvoices > 0 ? (fundedInvoices / verifiedInvoices) * 100 : 0,
      completionRate: fundedInvoices > 0 ? (completedInvoices / fundedInvoices) * 100 : 0,
    };
  }
}
