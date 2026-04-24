export const createMockRpcServer = () => ({
  getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
  getEvents: jest.fn().mockResolvedValue({
    events: [],
    cursor: undefined,
  }),
});
