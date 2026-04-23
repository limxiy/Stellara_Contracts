import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-base';

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

@Injectable()
export class NonceService {
  private readonly store = new Map<string, NonceEntry>();

  generateNonce(walletAddress: string): string {
    const nonce = randomBytes(16).toString('hex');
    this.store.set(walletAddress, { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
    return nonce;
  }

  verifySignature(walletAddress: string, signature: string): void {
    const entry = this.store.get(walletAddress);

    if (!entry) {
      throw new UnauthorizedException('No nonce found for this wallet. Request a new one.');
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(walletAddress);
      throw new UnauthorizedException('Nonce expired. Request a new one.');
    }

    try {
      const keypair = Keypair.fromPublicKey(walletAddress);
      const messageBytes = Buffer.from(entry.nonce, 'utf8');
      const signatureBytes = Buffer.from(signature, 'base64');
      const valid = keypair.verify(messageBytes, signatureBytes);

      if (!valid) {
        throw new UnauthorizedException('Invalid signature.');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Signature verification failed.');
    }

    // Consume nonce — prevents replay attacks
    this.store.delete(walletAddress);
  }
}
