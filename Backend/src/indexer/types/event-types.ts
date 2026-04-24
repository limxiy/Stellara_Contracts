/**
 * Contract event types from Soroban smart contracts
 * Matches the event symbols defined in contracts/shared/src/events.rs
 */


// Contract event type is now a string, loaded dynamically from config
export type ContractEventType = string;

/**
 * Raw event data from Stellar RPC
 */
export interface SorobanEvent {
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  pagingToken: string;
  topic: string[];
  value: string;
  inSuccessfulContractCall: boolean;
  txHash: string;
}

/**
 * Parsed contract event with structured data
 */
export interface ParsedContractEvent {
  eventId: string;
  ledgerSeq: number;
  ledgerClosedAt: Date;
  contractId: string;
  eventType: ContractEventType;
  transactionHash: string;
  data: Record<string, unknown>;
  inSuccessfulContractCall: boolean;
}

/**
 * Project created event data
 */
export interface ProjectCreatedEvent {
  projectId: number;
  creator: string;
  fundingGoal: string;
  deadline: number;
  token: string;
  ipfsHash?: string;
  metadataHash?: string;
  metadataCid?: string;
}

/**
 * Contribution made event data
 */
export interface ContributionMadeEvent {
  projectId: number;
  contributor: string;
  amount: string;
  totalRaised: string;
}

/**
 * Milestone created event data
 */
export interface MilestoneCreatedEvent {
  projectId: number;
  milestoneId: number;
  title?: string;
  description?: string;
  fundingAmount?: string;
}

/**
 * Milestone approved event data
 */
export interface MilestoneApprovedEvent {
  projectId: number;
  milestoneId: number;
  approvalCount: number;
}

/**
 * Funds released event data
 */
export interface FundsReleasedEvent {
  projectId: number;
  milestoneId: number;
  amount: string;
}

/**
 * Project status changed event data
 */
export interface ProjectStatusEvent {
  projectId: number;
  status: 'completed' | 'failed';
}

/**
 * Policy created event data
 */
export interface PolicyCreatedEvent {
  policyId: string;
  user: string;
  poolId: string;
  riskType: string;
  premium: string;
  coverageAmount: string;
}

/**
 * Claim submitted event data
 */
export interface ClaimSubmittedEvent {
  claimId: string;
  policyId: string;
  claimAmount: string;
}

/**
 * Claim paid event data
 */
export interface ClaimPaidEvent {
  claimId: string;
  payoutAmount: string;
}
