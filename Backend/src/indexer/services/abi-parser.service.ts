import { Injectable, Logger } from '@nestjs/common';
import { ContractRegistryService } from './contract-registry.service';
import { SorobanEvent, ParsedContractEvent } from '../types/event-types';
import { EventValidationResult } from '../types/contract-registry.types';

/**
 * Service for parsing events using contract ABIs
 * Integrates with the indexer to provide proper event parsing and validation
 */
@Injectable()
export class AbiParserService {
  private readonly logger = new Logger(AbiParserService.name);
  private readonly abiCache = new Map<string, any>(); // contractId -> ABI cache

  constructor(
    private readonly contractRegistryService: ContractRegistryService,
  ) {}

  /**
   * Parse event using contract ABI
   * Enhanced version of the basic parseEvent method
   */
  async parseEventWithAbi(event: SorobanEvent): Promise<ParsedContractEvent | null> {
    try {
      // Get contract ABI
      const abi = await this.getContractAbi(event.contractId);
      if (!abi) {
        this.logger.warn(`No ABI found for contract ${event.contractId}, falling back to basic parsing`);
        return this.fallbackParse(event);
      }

      // Extract event type from topic
      const eventTypeSymbol = event.topic[0];
      if (!eventTypeSymbol) {
        this.logger.warn(`Event ${event.id} missing topic`);
        return null;
      }

      // Find event in ABI
      const eventDefinition = abi.abiJson.events?.find((e: any) => e.topic === eventTypeSymbol);
      if (!eventDefinition) {
        this.logger.debug(`Event topic ${eventTypeSymbol} not found in ABI for contract ${event.contractId}`);
        return this.fallbackParse(event);
      }

      // Parse event data using ABI
      const parsedData = await this.parseEventDataWithAbi(event.value, eventDefinition);

      return {
        eventId: event.id,
        ledgerSeq: event.ledger,
        ledgerClosedAt: new Date(event.ledgerClosedAt),
        contractId: event.contractId,
        eventType: eventDefinition.name,
        transactionHash: event.txHash,
        data: parsedData,
        inSuccessfulContractCall: event.inSuccessfulContractCall,
      };
    } catch (error) {
      this.logger.error(`Error parsing event ${event.id} with ABI: ${error.message}`, error.stack);
      return this.fallbackParse(event);
    }
  }

  /**
   * Validate event against contract ABI
   */
  async validateEventWithAbi(event: SorobanEvent): Promise<EventValidationResult> {
    try {
      const eventTypeSymbol = event.topic[0];
      if (!eventTypeSymbol) {
        return {
          isValid: false,
          errors: ['Event missing topic'],
        };
      }

      // Parse basic event data first
      const basicData = this.parseBasicEventData(event.value);
      
      // Validate against ABI
      return await this.contractRegistryService.validateEvent(
        event.contractId,
        eventTypeSymbol,
        basicData,
      );
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Get supported event types for a contract
   */
  async getSupportedEvents(contractId: string): Promise<string[]> {
    const abi = await this.getContractAbi(contractId);
    if (!abi) {
      return [];
    }

    return (abi.abiJson.events as any[])?.map(event => event.name) || [];
  }

  /**
   * Check if contract has ABI registered
   */
  async hasAbi(contractId: string): Promise<boolean> {
    const abi = await this.getContractAbi(contractId);
    return abi !== null;
  }

  /**
   * Get contract ABI with caching
   */
  private async getContractAbi(contractId: string): Promise<any> {
    // Check cache first
    if (this.abiCache.has(contractId)) {
      return this.abiCache.get(contractId);
    }

    // Get from registry
    const abi = await this.contractRegistryService.getLatestAbi(contractId);
    
    if (abi) {
      // Cache the ABI
      this.abiCache.set(contractId, abi);
      
      // Set cache expiry (optional)
      setTimeout(() => {
        this.abiCache.delete(contractId);
      }, 5 * 60 * 1000); // 5 minutes
    }

    return abi;
  }

  /**
   * Parse event data using ABI definition
   */
  private async parseEventDataWithAbi(valueXdr: string, eventDefinition: any): Promise<Record<string, unknown>> {
    try {
      // For now, implement basic parsing
      // In a full implementation, you would use proper XDR decoding based on the ABI
      
      const basicData = this.parseBasicEventData(valueXdr);
      
      // Map and validate against ABI inputs
      const mappedData: Record<string, unknown> = {};
      
      if (eventDefinition.inputs && Array.isArray(eventDefinition.inputs)) {
        for (const input of eventDefinition.inputs) {
          const value = basicData[input.name];
          if (value !== undefined) {
            mappedData[input.name] = this.convertValue(value, input.type);
          }
        }
      }

      return mappedData;
    } catch (error) {
      this.logger.error(`Error parsing event data with ABI: ${error.message}`);
      throw error;
    }
  }

  /**
   * Basic XDR parsing (fallback)
   * This is a simplified version - in production, use proper Soroban SDK
   */
  private parseBasicEventData(valueXdr: string): Record<string, unknown> {
    try {
      // For now, return a placeholder structure
      // In a full implementation, you would decode the XDR using Soroban SDK
      
      // Try to parse as JSON if it's not XDR
      if (valueXdr.startsWith('{') || valueXdr.startsWith('[')) {
        try {
          return JSON.parse(valueXdr);
        } catch {
          // Not JSON, continue with XDR parsing
        }
      }

      // Placeholder XDR parsing
      return {
        rawXdr: valueXdr,
        // Add basic parsing logic here
      };
    } catch (error) {
      this.logger.warn(`Failed to parse event data: ${error.message}`);
      return { rawXdr: valueXdr };
    }
  }

  /**
   * Convert value to expected type based on ABI
   */
  private convertValue(value: unknown, expectedType: string): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    switch (expectedType.toLowerCase()) {
      case 'string':
      case 'address':
        return String(value);
      
      case 'number':
      case 'uint64':
      case 'uint128':
      case 'uint256':
      case 'int64':
      case 'int128':
      case 'int256':
        if (typeof value === 'string') {
          // Handle big numbers
          if (value.length > 15) {
            return value; // Keep as string for very large numbers
          }
          return Number(value);
        }
        return Number(value);
      
      case 'boolean':
        return Boolean(value);
      
      case 'bytes':
      case 'symbol':
        return String(value);
      
      default:
        // Handle complex types
        return value;
    }
  }

  /**
   * Fallback parsing method when ABI is not available
   */
  private fallbackParse(event: SorobanEvent): ParsedContractEvent | null {
    try {
      // Extract event type from topic
      const eventTypeSymbol = event.topic[0];
      if (!eventTypeSymbol) {
        this.logger.warn(`Event ${event.id} missing topic`);
        return null;
      }

      // Basic event type mapping (fallback)
      const eventType = this.mapEventTypeSymbol(eventTypeSymbol);
      if (!eventType) {
        this.logger.debug(`Unknown event type: ${eventTypeSymbol}`);
        return null;
      }

      // Parse event data (basic)
      const data = this.parseBasicEventData(event.value);

      return {
        eventId: event.id,
        ledgerSeq: event.ledger,
        ledgerClosedAt: new Date(event.ledgerClosedAt),
        contractId: event.contractId,
        eventType,
        transactionHash: event.txHash,
        data,
        inSuccessfulContractCall: event.inSuccessfulContractCall,
      };
    } catch (error) {
      this.logger.error(`Error in fallback parsing: ${error.message}`);
      return null;
    }
  }

  /**
   * Map event type symbol to name (fallback)
   */
  private mapEventTypeSymbol(symbol: string): string | null {
    // Basic mapping for common event types
    const eventTypeMap: Record<string, string> = {
      'proj_new': 'PROJECT_CREATED',
      'contrib': 'CONTRIBUTION_MADE',
      'm_create': 'MILESTONE_CREATED',
      'm_apprv': 'MILESTONE_APPROVED',
      'm_reject': 'MILESTONE_REJECTED',
      'release': 'FUNDS_RELEASED',
      'proj_done': 'PROJECT_COMPLETED',
      'proj_fail': 'PROJECT_FAILED',
      'policy_new': 'POLICY_CREATED',
      'claim_sub': 'CLAIM_SUBMITTED',
      'claim_paid': 'CLAIM_PAID',
    };

    return eventTypeMap[symbol] || symbol;
  }

  /**
   * Clear ABI cache (useful for testing or when ABIs are updated)
   */
  clearCache(): void {
    this.abiCache.clear();
    this.logger.log('ABI cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.abiCache.size,
      keys: Array.from(this.abiCache.keys()),
    };
  }
}
