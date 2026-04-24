import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Asset,
  Contract,
  Keypair,
  Networks,
  Operation,
  SorobanRpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

@Injectable()
export class InsuranceContractService {
  private readonly logger = new Logger(InsuranceContractService.name);
  private readonly rpc: SorobanRpc.Server;
  private readonly networkPassphrase: string;
  private readonly adminKeypair: Keypair;
  private readonly contractId: string;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org');
    this.rpc = new SorobanRpc.Server(rpcUrl);
    this.networkPassphrase = this.configService.get<string>(
      'STELLAR_NETWORK_PASSPHRASE',
      Networks.TESTNET,
    );
    
    const adminSecret = this.configService.get<string>('STELLAR_ADMIN_SECRET');
    if (adminSecret) {
      this.adminKeypair = Keypair.fromSecret(adminSecret);
    }

    this.contractId = this.configService.get<string>('INSURANCE_CONTRACT_ID');
  }

  async createPolicy(params: {
    policyholder: string;
    policyType: number;
    oracleFeed: string;
    triggerThreshold: bigint;
    triggerCondition: number;
    coverageAmount: bigint;
    premiumAmount: bigint;
    durationSecs: bigint;
  }) {
    this.logger.log(`Creating on-chain policy for ${params.policyholder}`);

    const contract = new Contract(this.contractId);
    const tx = await this.prepareContractCall(
      'create_policy',
      [
        new Address(params.policyholder).toScVal(),
        xdr.ScVal.scvSymbol(params.policyType === 0 ? 'ProjectFailure' : 'MarketVolatility'), // Simplified mapping
        xdr.ScVal.scvSymbol(params.oracleFeed),
        xdr.ScVal.scvI128(xdr.Int128Parts.fromBigInt(params.triggerThreshold)),
        xdr.ScVal.scvU32(params.triggerCondition),
        xdr.ScVal.scvI128(xdr.Int128Parts.fromBigInt(params.coverageAmount)),
        xdr.ScVal.scvI128(xdr.Int128Parts.fromBigInt(params.premiumAmount)),
        xdr.ScVal.scvU64(xdr.Uint64.fromNetPhi(params.durationSecs)),
      ],
      params.policyholder,
    );

    // In a real scenario, the user would sign this. 
    // Here we might return the XDR for the frontend to sign.
    return tx.toXDR();
  }

  async checkTrigger(policyId: bigint) {
    this.logger.log(`Triggering check_trigger for policy ${policyId}`);

    const contract = new Contract(this.contractId);
    const tx = await this.prepareContractCall(
      'check_trigger',
      [xdr.ScVal.scvU64(xdr.Uint64.fromNetPhi(policyId))],
      this.adminKeypair.publicKey(),
    );

    tx.sign(this.adminKeypair);
    const result = await this.rpc.sendTransaction(tx);
    return result;
  }

  private async prepareContractCall(method: string, args: xdr.ScVal[], source: string) {
    const account = await this.rpc.getLatestLedger();
    // This is a simplified version. Usually you fetch the account sequence.
    const sourceAccount = await this.rpc.getLedgerEntry(new Address(source).toScVal());
    
    // For simplicity, let's assume we have a helper to build Soroban txs
    // In actual stellar-sdk, you'd use TransactionBuilder and add a Soroban operation
    
    const builder = new TransactionBuilder(
      new SorobanRpc.Account(source, '0'), // Placeholder sequence
      {
        fee: '100',
        networkPassphrase: this.networkPassphrase,
      }
    );

    // Add Soroban invoke host function op
    // ... implementation details ...

    return builder.build();
  }
}
