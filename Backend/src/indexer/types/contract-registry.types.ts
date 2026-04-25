/**
 * Contract Registry Types
 * 
 * Types for managing contract ABIs and event schemas
 */

export interface ContractRegistryEntry {
  id: string;
  contractId: string;
  name: string;
  version: string;
  network: string;
  isActive: boolean;
  verified: boolean;
  description?: string;
  sourceCodeUrl?: string;
  documentationUrl?: string;
  deployedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractAbi {
  id: string;
  contractId: string;
  version: string;
  abiJson: Record<string, unknown>;
  abiHash: string;
  isActive: boolean;
  isLatest: boolean;
  deployedAt: Date;
  createdAt: Date;
}

export interface ContractEventSchema {
  id: string;
  abiId: string;
  contractId: string;
  eventName: string;
  eventTopic: string;
  signature: string;
  inputs: EventParameter[];
  isActive: boolean;
  createdAt: Date;
}

export interface EventParameter {
  name: string;
  type: string;
  indexed?: boolean;
  description?: string;
}

export interface AbiDefinition {
  name: string;
  version: string;
  networks: Record<string, string>; // network -> contractId
  events: AbiEvent[];
  functions?: AbiFunction[];
}

export interface AbiEvent {
  name: string;
  topic: string;
  signature: string;
  inputs: EventParameter[];
  description?: string;
}

export interface AbiFunction {
  name: string;
  inputs: EventParameter[];
  outputs: EventParameter[];
  description?: string;
}

export interface ContractRegistrationRequest {
  contractId: string;
  name: string;
  version?: string;
  network: string;
  description?: string;
  sourceCodeUrl?: string;
  documentationUrl?: string;
  abi: AbiDefinition;
}

export interface AbiUpdateRequest {
  version: string;
  abi: AbiDefinition;
  deprecatePrevious?: boolean;
}

export interface ContractRegistryStats {
  totalContracts: number;
  activeContracts: number;
  verifiedContracts: number;
  totalAbiVersions: number;
  supportedNetworks: string[];
  recentRegistrations: ContractRegistryEntry[];
}

export interface EventValidationResult {
  isValid: boolean;
  eventName?: string;
  parsedData?: Record<string, unknown>;
  errors?: string[];
  warnings?: string[];
}

export interface AbiValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  eventCount: number;
  functionCount: number;
}

export interface ContractSearchFilter {
  network?: string;
  verified?: boolean;
  active?: boolean;
  name?: string;
  hasAbi?: boolean;
}

export interface AbiVersionFilter {
  contractId?: string;
  version?: string;
  isActive?: boolean;
  isLatest?: boolean;
}
