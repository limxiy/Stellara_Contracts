import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { 
  ContractRegistryEntry, 
  ContractAbi, 
  ContractEventSchema, 
  ContractRegistrationRequest,
  AbiUpdateRequest,
  ContractRegistryStats,
  EventValidationResult,
  AbiValidationResult,
  ContractSearchFilter,
  AbiVersionFilter,
  AbiDefinition,
  AbiEvent,
  EventParameter
} from '../types/contract-registry.types';
import * as crypto from 'crypto';

@Injectable()
export class ContractRegistryService {
  private readonly logger = new Logger(ContractRegistryService.name);
  private readonly network: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
  }

  /**
   * Register a new contract with its ABI
   */
  async registerContract(request: ContractRegistrationRequest): Promise<ContractRegistryEntry> {
    this.logger.log(`Registering contract ${request.contractId} (${request.name})`);

    // Validate ABI structure
    const abiValidation = this.validateAbi(request.abi);
    if (!abiValidation.isValid) {
      throw new Error(`Invalid ABI: ${abiValidation.errors.join(', ')}`);
    }

    // Create contract registry entry
    const contract = await this.prisma.contractRegistry.create({
      data: {
        contractId: request.contractId,
        name: request.name,
        version: request.version || '1.0.0',
        network: request.network,
        description: request.description,
        sourceCodeUrl: request.sourceCodeUrl,
        documentationUrl: request.documentationUrl,
      },
    });

    // Create ABI version
    await this.createAbiVersion(contract.contractId, request.abi, true);

    this.logger.log(`Successfully registered contract ${request.contractId}`);
    return this.mapToContractRegistryEntry(contract);
  }

  /**
   * Update contract ABI with new version
   */
  async updateContractAbi(contractId: string, request: AbiUpdateRequest): Promise<ContractAbi> {
    this.logger.log(`Updating ABI for contract ${contractId} to version ${request.version}`);

    // Validate contract exists
    const contract = await this.prisma.contractRegistry.findUnique({
      where: { contractId },
    });

    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    // Validate ABI structure
    const abiValidation = this.validateAbi(request.abi);
    if (!abiValidation.isValid) {
      throw new Error(`Invalid ABI: ${abiValidation.errors.join(', ')}`);
    }

    // Deprecate previous versions if requested
    if (request.deprecatePrevious) {
      await this.prisma.contractAbi.updateMany({
        where: { contractId },
        data: { isActive: false, isLatest: false },
      });
    } else {
      // Just unset latest flag
      await this.prisma.contractAbi.updateMany({
        where: { contractId, isLatest: true },
        data: { isLatest: false },
      });
    }

    // Create new ABI version
    const abi = await this.createAbiVersion(contractId, request.abi, true, request.version);

    this.logger.log(`Successfully updated ABI for contract ${contractId} to version ${request.version}`);
    return abi;
  }

  /**
   * Get contract by ID
   */
  async getContract(contractId: string): Promise<ContractRegistryEntry | null> {
    const contract = await this.prisma.contractRegistry.findUnique({
      where: { contractId },
      include: {
        abiVersions: {
          where: { isActive: true },
          orderBy: { version: 'desc' },
        },
        events: {
          where: { isActive: true },
        },
      },
    });

    return contract ? this.mapToContractRegistryEntry(contract) : null;
  }

  /**
   * Get latest ABI for a contract
   */
  async getLatestAbi(contractId: string): Promise<ContractAbi | null> {
    const abi = await this.prisma.contractAbi.findFirst({
      where: { 
        contractId, 
        isActive: true,
        isLatest: true,
      },
      include: {
        events: {
          where: { isActive: true },
        },
      },
    });

    return abi ? this.mapToContractAbi(abi) : null;
  }

  /**
   * Get specific ABI version
   */
  async getAbiVersion(contractId: string, version: string): Promise<ContractAbi | null> {
    const abi = await this.prisma.contractAbi.findUnique({
      where: {
        contractId_version: {
          contractId,
          version,
        },
      },
      include: {
        events: {
          where: { isActive: true },
        },
      },
    });

    return abi ? this.mapToContractAbi(abi) : null;
  }

  /**
   * Search contracts with filters
   */
  async searchContracts(filter: ContractSearchFilter): Promise<ContractRegistryEntry[]> {
    const where: any = {};

    if (filter.network) where.network = filter.network;
    if (filter.verified !== undefined) where.verified = filter.verified;
    if (filter.active !== undefined) where.isActive = filter.active;
    if (filter.name) where.name = { contains: filter.name, mode: 'insensitive' };
    if (filter.hasAbi) {
      where.abiVersions = filter.hasAbi ? { some: {} } : { none: {} };
    }

    const contracts = await this.prisma.contractRegistry.findMany({
      where,
      include: {
        abiVersions: {
          where: { isActive: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return contracts.map(contract => this.mapToContractRegistryEntry(contract));
  }

  /**
   * Get contract registry statistics
   */
  async getRegistryStats(): Promise<ContractRegistryStats> {
    const [
      totalContracts,
      activeContracts,
      verifiedContracts,
      totalAbiVersions,
      networkStats,
      recentRegistrations,
    ] = await Promise.all([
      this.prisma.contractRegistry.count(),
      this.prisma.contractRegistry.count({ where: { isActive: true } }),
      this.prisma.contractRegistry.count({ where: { verified: true } }),
      this.prisma.contractAbi.count({ where: { isActive: true } }),
      this.prisma.contractRegistry.groupBy({
        by: ['network'],
        _count: true,
      }),
      this.prisma.contractRegistry.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      totalContracts,
      activeContracts,
      verifiedContracts,
      totalAbiVersions,
      supportedNetworks: networkStats.map(stat => stat.network),
      recentRegistrations: recentRegistrations.map(contract => 
        this.mapToContractRegistryEntry(contract)
      ),
    };
  }

  /**
   * Validate event against contract ABI
   */
  async validateEvent(contractId: string, eventTopic: string, eventData: Record<string, unknown>): Promise<EventValidationResult> {
    const abi = await this.getLatestAbi(contractId);
    
    if (!abi) {
      return {
        isValid: false,
        errors: [`No ABI found for contract ${contractId}`],
      };
    }

    const eventSchema = abi.events.find(event => event.eventTopic === eventTopic);
    
    if (!eventSchema) {
      return {
        isValid: false,
        errors: [`Event topic ${eventTopic} not found in contract ABI`],
      };
    }

    const validation = this.validateEventData(eventSchema, eventData);
    
    return {
      ...validation,
      eventName: eventSchema.eventName,
    };
  }

  /**
   * Get all ABI versions for a contract
   */
  async getAbiVersions(contractId: string, filter?: AbiVersionFilter): Promise<ContractAbi[]> {
    const where: any = { contractId };
    
    if (filter?.isActive !== undefined) where.isActive = filter.isActive;
    if (filter?.isLatest !== undefined) where.isLatest = filter.isLatest;
    if (filter?.version) where.version = filter.version;

    const abis = await this.prisma.contractAbi.findMany({
      where,
      include: {
        events: {
          where: { isActive: true },
        },
      },
      orderBy: { version: 'desc' },
    });

    return abis.map(abi => this.mapToContractAbi(abi));
  }

  /**
   * Deactivate contract
   */
  async deactivateContract(contractId: string): Promise<void> {
    await this.prisma.contractRegistry.update({
      where: { contractId },
      data: { isActive: false },
    });

    this.logger.log(`Deactivated contract ${contractId}`);
  }

  /**
   * Verify contract
   */
  async verifyContract(contractId: string): Promise<void> {
    await this.prisma.contractRegistry.update({
      where: { contractId },
      data: { verified: true },
    });

    this.logger.log(`Verified contract ${contractId}`);
  }

  /**
   * Create ABI version for contract
   */
  private async createAbiVersion(
    contractId: string, 
    abi: AbiDefinition, 
    isLatest: boolean = true,
    version?: string
  ): Promise<ContractAbi> {
    const abiVersion = version || abi.version || '1.0.0';
    const abiHash = this.calculateAbiHash(abi);

    // Create ABI record
    const abiRecord = await this.prisma.contractAbi.create({
      data: {
        contractId,
        version: abiVersion,
        abiJson: abi as any,
        abiHash,
        isLatest,
        isActive: true,
      },
    });

    // Create event schemas
    for (const event of abi.events) {
      await this.prisma.contractEvent.create({
        data: {
          abiId: abiRecord.id,
          contractId,
          eventName: event.name,
          eventTopic: event.topic,
          signature: event.signature,
          inputs: event.inputs as any,
          isActive: true,
        },
      });
    }

    return this.mapToContractAbi({
      ...abiRecord,
      events: abi.events.map(event => ({
        id: '', // Will be filled by database
        abiId: abiRecord.id,
        contractId,
        eventName: event.name,
        eventTopic: event.topic,
        signature: event.signature,
        inputs: event.inputs as any,
        isActive: true,
        createdAt: new Date(),
      })),
    });
  }

  /**
   * Validate ABI structure
   */
  private validateAbi(abi: AbiDefinition): AbiValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!abi.name) {
      errors.push('ABI name is required');
    }

    if (!abi.version) {
      errors.push('ABI version is required');
    }

    if (!abi.events || !Array.isArray(abi.events)) {
      errors.push('ABI events array is required');
    } else {
      // Validate each event
      for (const event of abi.events) {
        if (!event.name) {
          errors.push(`Event name is required`);
        }
        
        if (!event.topic) {
          errors.push(`Event topic is required for ${event.name}`);
        }
        
        if (!event.signature) {
          warnings.push(`Event signature is missing for ${event.name}`);
        }
        
        if (!event.inputs || !Array.isArray(event.inputs)) {
          warnings.push(`Event inputs array is missing for ${event.name}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      eventCount: abi.events?.length || 0,
      functionCount: abi.functions?.length || 0,
    };
  }

  /**
   * Validate event data against schema
   */
  private validateEventData(eventSchema: ContractEventSchema, eventData: Record<string, unknown>): EventValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const parsedData: Record<string, unknown> = {};

    // Check required parameters
    for (const param of eventSchema.inputs as EventParameter[]) {
      const value = eventData[param.name];
      
      if (value === undefined || value === null) {
        if (!param.optional) {
          errors.push(`Required parameter '${param.name}' is missing`);
        }
        continue;
      }

      // Type validation (basic)
      try {
        parsedData[param.name] = this.convertEventValue(value, param.type);
      } catch (error) {
        errors.push(`Invalid type for parameter '${param.name}': expected ${param.type}`);
      }
    }

    // Check for unexpected parameters
    const expectedParams = new Set(eventSchema.inputs.map((p: EventParameter) => p.name));
    const unexpectedParams = Object.keys(eventData).filter(key => !expectedParams.has(key));
    
    if (unexpectedParams.length > 0) {
      warnings.push(`Unexpected parameters: ${unexpectedParams.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      parsedData,
      errors,
      warnings,
    };
  }

  /**
   * Convert event value to expected type
   */
  private convertEventValue(value: unknown, expectedType: string): unknown {
    switch (expectedType.toLowerCase()) {
      case 'string':
        return String(value);
      case 'number':
      case 'uint256':
      case 'int256':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      case 'address':
        return String(value); // Keep as string for addresses
      default:
        return value; // Return as-is for complex types
    }
  }

  /**
   * Calculate hash of ABI for integrity
   */
  private calculateAbiHash(abi: AbiDefinition): string {
    const abiString = JSON.stringify(abi, Object.keys(abi).sort());
    return crypto.createHash('sha256').update(abiString).digest('hex');
  }

  /**
   * Map database record to ContractRegistryEntry
   */
  private mapToContractRegistryEntry(contract: any): ContractRegistryEntry {
    return {
      id: contract.id,
      contractId: contract.contractId,
      name: contract.name,
      version: contract.version,
      network: contract.network,
      isActive: contract.isActive,
      verified: contract.verified,
      description: contract.description || undefined,
      sourceCodeUrl: contract.sourceCodeUrl || undefined,
      documentationUrl: contract.documentationUrl || undefined,
      deployedAt: contract.deployedAt,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
    };
  }

  /**
   * Map database record to ContractAbi
   */
  private mapToContractAbi(abi: any): ContractAbi {
    return {
      id: abi.id,
      contractId: abi.contractId,
      version: abi.version,
      abiJson: abi.abiJson as Record<string, unknown>,
      abiHash: abi.abiHash,
      isActive: abi.isActive,
      isLatest: abi.isLatest,
      deployedAt: abi.deployedAt,
      createdAt: abi.createdAt,
    };
  }
}
