import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

@Injectable()
export class MfaService {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const key = this.configService.get<string>('MFA_ENCRYPTION_KEY');
    if (!key || key.length < 32) {
      throw new Error('MFA_ENCRYPTION_KEY must be at least 32 characters');
    }
    this.encryptionKey = Buffer.from(key.slice(0, 32), 'utf-8');
  }

  async generateSetup(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.mfaEnabled && user.mfaVerified) {
      throw new BadRequestException('MFA is already enabled and verified');
    }

    const secret = speakeasy.generateSecret({
      name: `Stellara (${user.walletAddress})`,
      length: 32,
    });

    const encryptedSecret = this.encrypt(secret.base32);
    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = backupCodes.map((code) => this.hashBackupCode(code));

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaVerified: false,
        backupCodes: hashedBackupCodes,
      },
    });

    let qrCodeUrl: string | null = null;
    if (secret.otpauth_url) {
      try {
        qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
      } catch {
        qrCodeUrl = null;
      }
    }

    return {
      otpauthUrl: secret.otpauth_url || '',
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  async verifySetup(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA setup has not been initiated');
    }

    if (user.mfaVerified) {
      throw new BadRequestException('MFA is already verified');
    }

    const secret = this.decrypt(user.mfaSecret);
    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaVerified: true,
        mfaEnforcedAt: new Date(),
      },
    });

    return { valid: true };
  }

  async verifyToken(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.mfaEnabled || !user.mfaVerified || !user.mfaSecret) {
      return true;
    }

    const secret = this.decrypt(user.mfaSecret);
    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (valid) {
      return true;
    }

    return this.verifyBackupCode(user, code);
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    const isValid = await this.verifyToken(userId, code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaVerified: false,
        mfaSecret: null,
        backupCodes: [],
        mfaEnforcedAt: null,
      },
    });

    return { disabled: true };
  }

  async recoverWithBackupCode(userId: string, backupCode: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.mfaEnabled || !user.mfaVerified) {
      throw new BadRequestException('MFA is not enabled');
    }

    const hashedCode = this.hashBackupCode(backupCode);
    const index = user.backupCodes.indexOf(hashedCode);

    if (index === -1) {
      throw new UnauthorizedException('Invalid backup code');
    }

    const newBackupCodes = this.generateBackupCodes();
    const hashedNewCodes = newBackupCodes.map((code) => this.hashBackupCode(code));

    const updatedBackupCodes = [...user.backupCodes];
    updatedBackupCodes.splice(index, 1);
    updatedBackupCodes.push(...hashedNewCodes);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        backupCodes: updatedBackupCodes,
      },
    });

    return {
      success: true,
      newBackupCodes: newBackupCodes,
      message: 'MFA recovered successfully. New backup codes have been generated.',
    };
  }

  async getMfaStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        mfaEnabled: true,
        mfaVerified: true,
        mfaEnforcedAt: true,
        backupCodes: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      enabled: user.mfaEnabled,
      verified: user.mfaVerified,
      enforcedAt: user.mfaEnforcedAt,
      remainingBackupCodes: user.backupCodes.length,
    };
  }

  private verifyBackupCode(user: { backupCodes: string[] }, code: string): boolean {
    const hashedCode = this.hashBackupCode(code);
    return user.backupCodes.includes(hashedCode);
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const randomBytes = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${randomBytes.slice(0, 4)}-${randomBytes.slice(4, 8)}`);
    }
    return codes;
  }

  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
