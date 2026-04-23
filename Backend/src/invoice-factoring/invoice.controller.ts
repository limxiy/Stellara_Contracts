import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiResponse({ status: 201, description: 'Invoice created successfully' })
  async createInvoice(
    @Request() req: any,
    @Body() createInvoiceDto: CreateInvoiceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const sellerId = req.user.id;
    return this.invoiceService.createInvoice(sellerId, createInvoiceDto, file);
  }

  @Get('my-invoices')
  @ApiOperation({ summary: 'Get current user invoices' })
  async getMyInvoices(
    @Request() req: any,
    @Query('status') status?: string,
  ) {
    const sellerId = req.user.id;
    return this.invoiceService.getInvoicesBySeller(sellerId, status as any);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get available invoices for investment' })
  async getAvailableInvoices(@Request() req: any) {
    const investorId = req.user.id;
    return this.invoiceService.getAvailableInvoices(investorId);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get invoice statistics' })
  async getStatistics(@Request() req: any) {
    const sellerId = req.user.id;
    return this.invoiceService.getInvoiceStatistics(sellerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async getInvoice(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    return this.invoiceService.getInvoiceById(id, userId);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify invoice with token' })
  async verifyInvoice(
    @Param('id') id: string,
    @Body('token') token: string,
  ) {
    return this.invoiceService.verifyInvoice(id, token);
  }
}
