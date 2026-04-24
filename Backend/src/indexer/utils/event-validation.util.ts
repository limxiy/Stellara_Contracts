import { BadRequestException } from '@nestjs/common';

/**
 * Validation utilities for blockchain event data
 */

export class EventValidationError extends BadRequestException {
  constructor(message: string, public readonly eventData: any) {
    super(`Event validation failed: ${message}`);
  }
}

/**
 * Validate Stellar address format
 */
export function isValidStellarAddress(address: string): boolean {
  // Basic Stellar address validation (public key or contract ID)
  return /^[GC][A-Z0-9]{55}$/.test(address);
}

/**
 * Validate positive BigInt string
 */
export function isValidPositiveBigInt(value: string): boolean {
  try {
    const num = BigInt(value);
    return num > 0n;
  } catch {
    return false;
  }
}

/**
 * Validate timestamp is in future
 */
export function isValidFutureTimestamp(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return timestamp > now;
}

/**
 * Validate timestamp is not too far in future (max 10 years)
 */
export function isValidReasonableFutureTimestamp(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const maxFuture = now + (10 * 365 * 24 * 60 * 60); // 10 years
  return timestamp > now && timestamp <= maxFuture;
}

/**
 * Validate contract ID format
 */
export function isValidContractId(contractId: string): boolean {
  // Contract IDs are 32-byte hex strings
  return /^[a-f0-9]{64}$/i.test(contractId);
}

/**
 * Validate project ID (should be positive integer)
 */
export function isValidProjectId(projectId: any): boolean {
  const num = typeof projectId === 'number' ? projectId : parseInt(String(projectId), 10);
  return !isNaN(num) && num > 0 && num <= Number.MAX_SAFE_INTEGER;
}

/**
 * Validate milestone ID
 */
export function isValidMilestoneId(milestoneId: any): boolean {
  return isValidProjectId(milestoneId); // Same validation as project ID
}

/**
 * Validate amount (positive BigInt string or number)
 */
export function isValidAmount(amount: any): boolean {
  if (typeof amount === 'string') {
    return isValidPositiveBigInt(amount);
  }
  if (typeof amount === 'number') {
    return amount > 0 && Number.isFinite(amount);
  }
  return false;
}

/**
 * Validate percentage (0-100)
 */
export function isValidPercentage(percentage: number): boolean {
  return typeof percentage === 'number' && percentage >= 0 && percentage <= 100;
}

/**
 * Validate array length
 */
export function isValidArrayLength(array: any[], minLength = 0, maxLength = Number.MAX_SAFE_INTEGER): boolean {
  return Array.isArray(array) && array.length >= minLength && array.length <= maxLength;
}

/**
 * Comprehensive event validation
 */
export function validateEventData(eventType: string, data: Record<string, any>): void {
  if (!data || typeof data !== 'object') {
    throw new EventValidationError('Event data must be an object', data);
  }

  switch (eventType) {
    case 'proj_new':
      validateProjectCreatedEvent(data);
      break;
    case 'contrib':
      validateContributionMadeEvent(data);
      break;
    case 'm_create':
      validateMilestoneCreatedEvent(data);
      break;
    case 'm_apprv':
      validateMilestoneApprovedEvent(data);
      break;
    case 'release':
      validateFundsReleasedEvent(data);
      break;
    // Add more event types as needed
    default:
      // For unknown events, do basic validation
      validateBasicEventData(data);
  }
}

function validateProjectCreatedEvent(data: any): void {
  if (data.projectId === undefined || data.projectId === null) {
    throw new EventValidationError('projectId is required', data);
  }
  if (!isValidProjectId(data.projectId)) {
    throw new EventValidationError('Invalid projectId format', data);
  }

  if (!data.creator || typeof data.creator !== 'string') {
    throw new EventValidationError('creator address is required', data);
  }
  if (!isValidStellarAddress(data.creator)) {
    throw new EventValidationError('Invalid creator address format', data);
  }

  if (!data.fundingGoal) {
    throw new EventValidationError('fundingGoal is required', data);
  }
  if (!isValidPositiveBigInt(String(data.fundingGoal))) {
    throw new EventValidationError('fundingGoal must be positive', data);
  }

  if (data.deadline === undefined || data.deadline === null) {
    throw new EventValidationError('deadline is required', data);
  }
  if (!isValidReasonableFutureTimestamp(Number(data.deadline))) {
    throw new EventValidationError('deadline must be in future and within 10 years', data);
  }

  if (!data.token || typeof data.token !== 'string') {
    throw new EventValidationError('token is required', data);
  }
  if (!isValidStellarAddress(data.token)) {
    throw new EventValidationError('Invalid token address format', data);
  }

  const optionalHashes = [data.ipfsHash, data.metadataHash, data.metadataCid];
  for (const hash of optionalHashes) {
    if (hash !== undefined && hash !== null && !isValidIpfsHash(hash)) {
      throw new EventValidationError('Invalid IPFS metadata hash format', data);
    }
  }
}

function isValidIpfsHash(hash: unknown): boolean {
  if (typeof hash !== 'string') {
    return false;
  }

  let normalized = hash.trim();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('ipfs://')) {
    normalized = normalized.slice('ipfs://'.length);
  }

  if (normalized.startsWith('/ipfs/')) {
    normalized = normalized.slice('/ipfs/'.length);
  }

  if (normalized.includes('/')) {
    normalized = normalized.split('/')[0];
  }

  return /^[A-Za-z0-9]{20,100}$/.test(normalized);
}

function validateContributionMadeEvent(data: any): void {
  if (data.projectId === undefined || data.projectId === null) {
    throw new EventValidationError('projectId is required', data);
  }
  if (!isValidProjectId(data.projectId)) {
    throw new EventValidationError('Invalid projectId format', data);
  }

  if (!data.contributor || typeof data.contributor !== 'string') {
    throw new EventValidationError('contributor address is required', data);
  }
  if (!isValidStellarAddress(data.contributor)) {
    throw new EventValidationError('Invalid contributor address format', data);
  }

  if (data.amount === undefined || data.amount === null) {
    throw new EventValidationError('amount is required', data);
  }
  if (!isValidAmount(data.amount)) {
    throw new EventValidationError('amount must be positive', data);
  }
}

function validateMilestoneApprovedEvent(data: any): void {
  if (data.projectId === undefined || data.projectId === null) {
    throw new EventValidationError('projectId is required', data);
  }
  if (!isValidProjectId(data.projectId)) {
    throw new EventValidationError('Invalid projectId format', data);
  }

  if (data.milestoneId === undefined || data.milestoneId === null) {
    throw new EventValidationError('milestoneId is required', data);
  }
  if (!isValidMilestoneId(data.milestoneId)) {
    throw new EventValidationError('Invalid milestoneId format', data);
  }

  if (data.approvalCount === undefined || data.approvalCount === null) {
    throw new EventValidationError('approvalCount is required', data);
  }
  const approvalCount = Number(data.approvalCount);
  if (!Number.isInteger(approvalCount) || approvalCount < 0) {
    throw new EventValidationError('approvalCount must be non-negative integer', data);
  }
}

function validateMilestoneCreatedEvent(data: any): void {
  if (data.projectId === undefined || data.projectId === null) {
    throw new EventValidationError('projectId is required', data);
  }
  if (!isValidProjectId(data.projectId)) {
    throw new EventValidationError('Invalid projectId format', data);
  }

  if (data.milestoneId === undefined || data.milestoneId === null) {
    throw new EventValidationError('milestoneId is required', data);
  }
  if (!isValidMilestoneId(data.milestoneId)) {
    throw new EventValidationError('Invalid milestoneId format', data);
  }

  if (data.fundingAmount !== undefined && data.fundingAmount !== null && !isValidAmount(data.fundingAmount)) {
    throw new EventValidationError('fundingAmount must be positive when provided', data);
  }
}

function validateFundsReleasedEvent(data: any): void {
  if (data.projectId === undefined || data.projectId === null) {
    throw new EventValidationError('projectId is required', data);
  }
  if (!isValidProjectId(data.projectId)) {
    throw new EventValidationError('Invalid projectId format', data);
  }

  if (data.milestoneId === undefined || data.milestoneId === null) {
    throw new EventValidationError('milestoneId is required', data);
  }
  if (!isValidMilestoneId(data.milestoneId)) {
    throw new EventValidationError('Invalid milestoneId format', data);
  }

  if (data.amount === undefined || data.amount === null) {
    throw new EventValidationError('amount is required', data);
  }
  if (!isValidAmount(data.amount)) {
    throw new EventValidationError('amount must be positive', data);
  }
}

function validateBasicEventData(data: any): void {
  // Basic validation for unknown event types
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      throw new EventValidationError(`${key} cannot be undefined`, data);
    }
  }
}