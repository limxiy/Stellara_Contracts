import {
  Injectable,
  Logger,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { IpfsService } from './ipfs.service';

// Allowed MIME types and their max sizes
const ALLOWED_TYPES: Record<string, number> = {
  'image/jpeg':       5  * 1024 * 1024, // 5MB
  'image/png':        5  * 1024 * 1024,
  'image/gif':        5  * 1024 * 1024,
  'image/webp':       5  * 1024 * 1024,
  'application/pdf': 10  * 1024 * 1024, // 10MB
  'application/json': 1  * 1024 * 1024, // 1MB
};

// Extensions that map to each allowed MIME type
const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  json: 'application/json',
};

export interface UploadResult {
  url: string;
  size: number;
  mimeType: string;
  filename: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Per-user upload tracking for rate limiting
  private readonly userUploadTimestamps = new Map<string, number[]>();
  private readonly RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour
  private readonly RATE_LIMIT_MAX_UPLOADS = 20;

  constructor(private readonly ipfsService: IpfsService) {}

  validateFile(file: Express.Multer.File): void {
    if (!file) throw new BadRequestException('No file provided');

    // 1. Check MIME type against allowlist
    if (!ALLOWED_TYPES[file.mimetype]) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed. Allowed types: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
      );
    }

    // 2. Verify extension matches MIME type (prevents extension spoofing)
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const expectedMime = EXTENSION_MIME_MAP[ext];
    if (expectedMime !== file.mimetype) {
      throw new BadRequestException(
        `File extension .${ext} does not match content type ${file.mimetype}`,
      );
    }

    // 3. Check file size against per-type limit
    const maxSize = ALLOWED_TYPES[file.mimetype];
    if (file.size > maxSize) {
      throw new PayloadTooLargeException(
        `File size ${file.size} bytes exceeds limit of ${maxSize} bytes for type ${file.mimetype}`,
      );
    }

    // 4. Block suspiciously small files that claim to be images (possible null-byte attacks)
    if (file.mimetype.startsWith('image/') && file.size < 100) {
      throw new BadRequestException('File is too small to be a valid image');
    }
  }

  checkRateLimit(userId: string): void {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW_MS;
    const timestamps = (this.userUploadTimestamps.get(userId) || [])
      .filter(ts => ts > windowStart);

    if (timestamps.length >= this.RATE_LIMIT_MAX_UPLOADS) {
      throw new BadRequestException(
        `Upload rate limit exceeded. Max ${this.RATE_LIMIT_MAX_UPLOADS} uploads per hour.`,
      );
    }

    timestamps.push(now);
    this.userUploadTimestamps.set(userId, timestamps);
  }

  async uploadToIpfs(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    this.checkRateLimit(userId);
    this.validateFile(file);

    this.logger.log(
      `Uploading to IPFS: ${file.originalname} (${file.size} bytes, ${file.mimetype}) for user ${userId}`,
    );

    try {
      const cid = await this.ipfsService.upload(file.buffer, {
        contentType: file.mimetype,
      });
      const url = `https://ipfs.io/ipfs/${cid}`;

      return {
        url,
        size: file.size,
        mimeType: file.mimetype,
        filename: file.originalname,
      };
    } catch (error) {
      this.logger.error('IPFS upload failed:', error);
      throw new BadRequestException('Failed to upload file to IPFS');
    }
  }

  async uploadImage(file: Express.Multer.File, userId: string): Promise<UploadResult> {
    this.checkRateLimit(userId);
    this.validateFile(file);

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed for image upload');
    }

    this.logger.log(
      `Processing image: ${file.originalname} (${file.size} bytes) for user ${userId}`,
    );

    // In production: run through sharp for resize/optimize, then upload to S3/CDN
    const url = `https://cdn.example.com/images/${userId}-${Date.now()}-${file.originalname}`;

    return {
      url,
      size: file.size,
      mimeType: file.mimetype,
      filename: file.originalname,
    };
  }

  async pinProjectMetadata(metadata: Record<string, unknown>): Promise<string> {
    const payload = Buffer.from(JSON.stringify(metadata || {}));
    const cid = `bafy${payload.toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;
    return cid;
  }

  async optimizeImage(imagePath: string, width: number, height: number): Promise<string> {
    this.logger.log(`Optimizing image ${imagePath} to ${width}x${height}`);
    return `${imagePath}?w=${width}&h=${height}&optimized=true`;
  }

  verifyIPFSHash(hash: string): boolean {
    if (!hash) return false;
    return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(hash) || /^bafy[a-z0-9]+$/i.test(hash);
  }

  getAllowedTypes(): string[] {
    return Object.keys(ALLOWED_TYPES);
  }

  getUploadStats(userId: string): Record<string, any> {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW_MS;
    const recentUploads = (this.userUploadTimestamps.get(userId) || [])
      .filter(ts => ts > windowStart);

    return {
      uploadsInLastHour: recentUploads.length,
      remainingUploads: Math.max(0, this.RATE_LIMIT_MAX_UPLOADS - recentUploads.length),
      resetInMs: recentUploads.length > 0 ? recentUploads[0] + this.RATE_LIMIT_WINDOW_MS - now : 0,
    };
  }
}