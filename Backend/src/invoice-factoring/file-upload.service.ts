import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FileFilterCallback } from 'multer';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

@Injectable()
export class FileUploadService {
  constructor(private configService: ConfigService) {}

  getMulterOptions() {
    const storage = diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = this.configService.get<string>('UPLOAD_PATH') || './uploads/invoices';
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
      },
    });

    const fileFilter = (req: any, file: UploadedFile, cb: FileFilterCallback) => {
      const allowedMimes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/tiff',
      ];

      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Only PDF, JPEG, PNG, and TIFF files are allowed'));
      }
    };

    return {
      storage,
      fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    };
  }

  validateFile(file: UploadedFile) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
    ];

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only PDF, JPEG, PNG, and TIFF are allowed');
    }

    return true;
  }

  getFileUrl(filename: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return `${baseUrl}/uploads/invoices/${filename}`;
  }
}
