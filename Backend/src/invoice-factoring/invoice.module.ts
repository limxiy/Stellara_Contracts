import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { AuctionService } from './auction.service';
import { PaymentService } from './payment.service';
import { VerificationService } from './verification.service';
import { FileUploadService } from './file-upload.service';
import { OcrService } from './ocr.service';
import { AccountingService } from './accounting.service';
import { PrismaService } from '../prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    AuctionService,
    PaymentService,
    VerificationService,
    FileUploadService,
    OcrService,
    AccountingService,
    PrismaService,
  ],
  exports: [
    InvoiceService,
    AuctionService,
    PaymentService,
    VerificationService,
    FileUploadService,
    OcrService,
    AccountingService,
  ],
})
export class InvoiceModule {}
