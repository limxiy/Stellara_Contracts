import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { NonceService } from '../../nonce/nonce.service';

/**
 * Guard that enforces wallet ownership via challenge-response signature verification.
 * Expects headers: x-wallet-address and x-wallet-signature (base64-encoded).
 */
@Injectable()
export class WalletAuthGuard implements CanActivate {
  constructor(private readonly nonceService: NonceService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const walletAddress = req.headers['x-wallet-address'] as string;
    const signature = req.headers['x-wallet-signature'] as string;

    if (!walletAddress || !signature) {
      throw new UnauthorizedException('Missing x-wallet-address or x-wallet-signature header.');
    }

    this.nonceService.verifySignature(walletAddress, signature);
    req.walletAddress = walletAddress;
    return true;
  }
}
