import { ContractEventType, SorobanEvent, ParsedContractEvent } from '../../types/event-types';

export const createMockSorobanEvent = (overrides: Partial<SorobanEvent> = {}): SorobanEvent => ({
  type: 'contract',
  ledger: 123456,
  ledgerClosedAt: new Date().toISOString(),
  contractId: 'C1234567890ABCDEF',
  id: 'event-id-1',
  pagingToken: 'token-1',
  topic: ['proj_new'],
  value: 'mock-xdr-value',
  inSuccessfulContractCall: true,
  txHash: 'hash-123',
  ...overrides,
});

export const createMockParsedEvent = (overrides: Partial<ParsedContractEvent> = {}): ParsedContractEvent => ({
  eventId: 'event-id-1',
  ledgerSeq: 123456,
  ledgerClosedAt: new Date(),
  contractId: 'C1234567890ABCDEF',
  eventType: 'proj_new',
  transactionHash: 'hash-123',
  data: {},
  inSuccessfulContractCall: true,
  ...overrides,
});

export const mockProjectCreatedData = {
  projectId: 1,
  creator: 'GBC...',
  fundingGoal: '1000000',
  deadline: Math.floor(Date.now() / 1000) + 86400,
  token: 'XLM',
};

export const mockContributionMadeData = {
  projectId: 1,
  contributor: 'GBD...',
  amount: '500',
  totalRaised: '500',
};

export const mockMilestoneApprovedData = {
  projectId: 1,
  milestoneId: 0,
  approvalCount: 5,
};

export const mockFundsReleasedData = {
  projectId: 1,
  milestoneId: 0,
  amount: '200000',
};
