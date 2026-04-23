import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Tesseract from 'tesseract.js';
import { OcrExtractedDataDto } from './dto/create-invoice.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private configService: ConfigService) {}

  async extractInvoiceData(filePath: string): Promise<OcrExtractedDataDto> {
    try {
      this.logger.log(`Starting OCR extraction for file: ${filePath}`);

      // Perform OCR using Tesseract.js
      const result = await Tesseract.recognize(
        filePath,
        'eng',
        {
          logger: (m) => this.logger.debug(m),
        }
      );

      const extractedText = result.data.text;
      this.logger.log(`OCR completed. Extracted text length: ${extractedText.length}`);

      // Parse the extracted text to extract invoice fields
      const invoiceData = this.parseInvoiceText(extractedText);
      
      // Add confidence score
      invoiceData.confidence = result.data.confidence;

      this.logger.log(`Invoice data extracted successfully with confidence: ${result.data.confidence}`);
      return invoiceData;

    } catch (error) {
      this.logger.error(`OCR extraction failed: ${error.message}`);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  private parseInvoiceText(text: string): OcrExtractedDataDto {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const result: OcrExtractedDataDto = {};

    // Common patterns for invoice fields
    const patterns = {
      invoiceNumber: [
        /(?:invoice\s*#|invoice\s*no\.?|bill\s*#|bill\s*no\.?):?\s*([A-Z0-9\-\/]+)/i,
        /(?:invoice|bill)\s*(?:number|no\.?)\s*:?\s*([A-Z0-9\-\/]+)/i,
        /^([A-Z0-9\-\/]{3,})$/m
      ],
      amount: [
        /(?:total|amount|due|balance)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
        /\$?\s*([\d,]+\.\d{2})\s*(?:total|due|amount)/i,
        /(?:subtotal|sum)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i
      ],
      date: [
        /(?:date|issued|invoice\s*date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /(?:date|issued|invoice\s*date)\s*:?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/
      ],
      dueDate: [
        /(?:due\s*date|payment\s*due|pay\s*by)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /(?:due\s*date|payment\s*due|pay\s*by)\s*:?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i
      ],
      buyerName: [
        /(?:bill\s*to|customer|client)\s*:?\s*([^\n]+)/i,
        /(?:attention|attn\.?)\s*:?\s*([^\n]+)/i
      ],
      email: [
        /(?:email|e-mail)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      ]
    };

    // Extract each field using patterns
    for (const [field, fieldPatterns] of Object.entries(patterns)) {
      for (const pattern of fieldPatterns) {
        const match = text.match(pattern);
        if (match) {
          switch (field) {
            case 'invoiceNumber':
              result.invoiceNumber = match[1];
              break;
            case 'amount':
              const amount = parseFloat(match[1].replace(/,/g, ''));
              if (!isNaN(amount) && amount > 0) {
                result.amount = amount;
              }
              break;
            case 'date':
              result.issueDate = this.parseDate(match[1]);
              break;
            case 'dueDate':
              result.dueDate = this.parseDate(match[1]);
              break;
            case 'buyerName':
              result.buyerName = match[1].trim();
              break;
            case 'email':
              result.buyerEmail = match[1];
              break;
          }
          break; // Stop after first match for each field
        }
      }
    }

    // Extract description from common invoice sections
    const descriptionMatch = text.match(/(?:description|item|product|service)\s*:?\s*([^\n]+)/i);
    if (descriptionMatch) {
      result.description = descriptionMatch[1].trim();
    }

    return result;
  }

  private parseDate(dateString: string): Date {
    // Try different date formats
    const formats = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/, // MM/DD/YYYY or DD/MM/YYYY
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,    // YYYY/MM/DD
    ];

    for (const format of formats) {
      const match = dateString.match(format);
      if (match) {
        let year, month, day;
        
        if (format.source.includes('\\d{4}')) {
          // YYYY/MM/DD format
          [, year, month, day] = match;
        } else {
          // MM/DD/YYYY or DD/MM/YYYY format (assume MM/DD/YYYY)
          [, month, day, year] = match;
          year = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
        }

        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return new Date(); // Fallback to current date
  }

  async validateExtractedData(data: OcrExtractedDataDto): Promise<{
    isValid: boolean;
    confidence: number;
    missingFields: string[];
  }> {
    const requiredFields = ['invoiceNumber', 'amount', 'buyerName'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    // Calculate confidence based on available fields and OCR confidence
    let fieldConfidence = (requiredFields.length - missingFields.length) / requiredFields.length;
    let overallConfidence = (fieldConfidence + (data.confidence || 0)) / 2;

    return {
      isValid: missingFields.length === 0 && overallConfidence > 0.6,
      confidence: overallConfidence,
      missingFields
    };
  }

  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Temporary file cleaned up: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup temporary file ${filePath}: ${error.message}`);
    }
  }
}
