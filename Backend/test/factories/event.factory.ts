import { SorobanEvent } from '../../src/indexer/types/event-types';
import { randomUUID } from 'crypto';

export const createSorobanEvent = (
  eventType: string,
  dataXdr: string,
  overrides: Partial<SorobanEvent> = {}
): SorobanEvent => {
  return {
    type: 'contract',
    ledger: 1000,
    ledgerClosedAt: new Date().toISOString(),
    contractId: 'CC' + Math.random().toString(36).substring(7).toUpperCase(),
    id: randomUUID(),
    pagingToken: randomUUID(),
    topic: [eventType],
    value: dataXdr,
    inSuccessfulContractCall: true,
    txHash: '0x' + Math.random().toString(16).substring(2),
    ...overrides,
  };
};

export const generateEventSequence = (
  contractId: string,
  startLedger: number,
  events: Array<{ type: string; data: string }>
): SorobanEvent[] => {
  return events.map((e, index) => 
    createSorobanEvent(e.type, e.data, {
      contractId,
      ledger: startLedger + index,
      id: `event-${startLedger + index}-${index}`,
    })
  );
};
