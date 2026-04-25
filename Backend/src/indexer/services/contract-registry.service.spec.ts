import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { ContractRegistryService } from './contract-registry.service';
import { ContractRegistrationRequest, AbiDefinition } from '../types/contract-registry.types';

describe('ContractRegistryService', () => {
  let service: ContractRegistryService;
  let prisma: PrismaService;
  let configService: ConfigService;

  const mockPrisma = {
    contractRegistry: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    contractAbi: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    contractEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractRegistryService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ContractRegistryService>(ContractRegistryService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerContract', () => {
    it('should register a new contract with ABI', async () => {
      const contractId = 'CDLZFC3SYJYD5T5Z3W57CN2UYAF6LW5PGQ3STCTXYSY7MP2P3KU4A';
      const abi: AbiDefinition = {
        name: 'ProjectLaunch',
        version: '1.0.0',
        networks: { testnet: contractId },
        events: [
          {
            name: 'PROJECT_CREATED',
            topic: 'proj_new',
            signature: 'proj_new(address,uint256,uint256)',
            inputs: [
              { name: 'creator', type: 'address' },
              { name: 'fundingGoal', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
        ],
      };

      const registrationRequest: ContractRegistrationRequest = {
        contractId,
        name: 'Project Launch Contract',
        network: 'testnet',
        abi,
      };

      const mockContract = {
        id: '1',
        contractId,
        name: 'Project Launch Contract',
        version: '1.0.0',
        network: 'testnet',
        isActive: true,
        verified: false,
        description: null,
        sourceCodeUrl: null,
        documentationUrl: null,
        deployedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.contractRegistry.create.mockResolvedValue(mockContract);
      mockPrisma.contractAbi.create.mockResolvedValue({ id: 'abi1' });
      mockPrisma.contractEvent.create.mockResolvedValue({ id: 'event1' });

      const result = await service.registerContract(registrationRequest);

      expect(result).toEqual(mockContract);
      expect(mockPrisma.contractRegistry.create).toHaveBeenCalledWith({
        data: {
          contractId,
          name: 'Project Launch Contract',
          version: '1.0.0',
          network: 'testnet',
          description: undefined,
          sourceCodeUrl: undefined,
          documentationUrl: undefined,
        },
      });
    });

    it('should throw error for invalid ABI', async () => {
      const invalidAbi: AbiDefinition = {
        name: '',
        version: '1.0.0',
        networks: {},
        events: [],
      };

      const registrationRequest: ContractRegistrationRequest = {
        contractId: 'test-contract',
        name: 'Test Contract',
        network: 'testnet',
        abi: invalidAbi,
      };

      await expect(service.registerContract(registrationRequest)).rejects.toThrow('Invalid ABI');
    });
  });

  describe('getContract', () => {
    it('should return contract details', async () => {
      const contractId = 'test-contract';
      const mockContract = {
        id: '1',
        contractId,
        name: 'Test Contract',
        version: '1.0.0',
        network: 'testnet',
        isActive: true,
        verified: false,
        description: null,
        sourceCodeUrl: null,
        documentationUrl: null,
        deployedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        abiVersions: [],
        events: [],
      };

      mockPrisma.contractRegistry.findUnique.mockResolvedValue(mockContract);

      const result = await service.getContract(contractId);

      expect(result).toEqual(mockContract);
      expect(mockPrisma.contractRegistry.findUnique).toHaveBeenCalledWith({
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
    });

    it('should return null for non-existent contract', async () => {
      mockPrisma.contractRegistry.findUnique.mockResolvedValue(null);

      const result = await service.getContract('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getLatestAbi', () => {
    it('should return latest ABI for contract', async () => {
      const contractId = 'test-contract';
      const mockAbi = {
        id: 'abi1',
        contractId,
        version: '1.0.0',
        abiJson: { name: 'Test', events: [] },
        abiHash: 'hash123',
        isActive: true,
        isLatest: true,
        deployedAt: new Date(),
        createdAt: new Date(),
        events: [],
      };

      mockPrisma.contractAbi.findFirst.mockResolvedValue(mockAbi);

      const result = await service.getLatestAbi(contractId);

      expect(result).toEqual(mockAbi);
      expect(mockPrisma.contractAbi.findFirst).toHaveBeenCalledWith({
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
    });

    it('should return null when no ABI found', async () => {
      mockPrisma.contractAbi.findFirst.mockResolvedValue(null);

      const result = await service.getLatestAbi('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('validateEvent', () => {
    it('should validate event against ABI', async () => {
      const contractId = 'test-contract';
      const eventTopic = 'proj_new';
      const eventData = {
        creator: '0x123...',
        fundingGoal: '1000000',
        deadline: '1234567890',
      };

      const mockAbi = {
        id: 'abi1',
        contractId,
        version: '1.0.0',
        abiJson: { name: 'Test', events: [] },
        abiHash: 'hash123',
        isActive: true,
        isLatest: true,
        deployedAt: new Date(),
        createdAt: new Date(),
        events: [
          {
            id: 'event1',
            abiId: 'abi1',
            contractId,
            eventName: 'PROJECT_CREATED',
            eventTopic: 'proj_new',
            signature: 'proj_new(address,uint256,uint256)',
            inputs: [
              { name: 'creator', type: 'address' },
              { name: 'fundingGoal', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
            isActive: true,
            createdAt: new Date(),
          },
        ],
      };

      mockPrisma.contractAbi.findFirst.mockResolvedValue(mockAbi);

      const result = await service.validateEvent(contractId, eventTopic, eventData);

      expect(result.isValid).toBe(true);
      expect(result.eventName).toBe('PROJECT_CREATED');
      expect(result.parsedData).toBeDefined();
    });

    it('should return error when no ABI found', async () => {
      mockPrisma.contractAbi.findFirst.mockResolvedValue(null);

      const result = await service.validateEvent('non-existent', 'test_topic', {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No ABI found for contract non-existent');
    });
  });

  describe('getRegistryStats', () => {
    it('should return registry statistics', async () => {
      mockPrisma.contractRegistry.count.mockResolvedValue(10);
      mockPrisma.contractRegistry.count.mockResolvedValueOnce(8); // active
      mockPrisma.contractRegistry.count.mockResolvedValueOnce(5); // verified
      mockPrisma.contractAbi.count.mockResolvedValue(15);
      mockPrisma.contractRegistry.groupBy.mockResolvedValue([
        { network: 'testnet', _count: 8 },
        { network: 'mainnet', _count: 2 },
      ]);
      mockPrisma.contractRegistry.findMany.mockResolvedValue([]);

      const stats = await service.getRegistryStats();

      expect(stats.totalContracts).toBe(10);
      expect(stats.activeContracts).toBe(8);
      expect(stats.verifiedContracts).toBe(5);
      expect(stats.totalAbiVersions).toBe(15);
      expect(stats.supportedNetworks).toEqual(['testnet', 'mainnet']);
      expect(stats.recentRegistrations).toEqual([]);
    });
  });
});
