import { Module } from '@nestjs/common';
import { QuantumCryptoService } from './quantum-crypto.service';

@Module({
  providers: [QuantumCryptoService],
  exports: [QuantumCryptoService],
})
export class QuantumCryptoModule {}
