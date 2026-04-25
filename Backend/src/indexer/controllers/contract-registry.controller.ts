import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ContractRegistryService } from '../services/contract-registry.service';
import {
  ContractRegistrationRequest,
  AbiUpdateRequest,
  ContractRegistryStats,
  EventValidationResult,
  ContractSearchFilter,
  AbiVersionFilter,
} from '../types/contract-registry.types';

@ApiTags('contract-registry')
@Controller('indexer/contracts')
@UseGuards(JwtAuthGuard)
export class ContractRegistryController {
  constructor(
    private readonly contractRegistryService: ContractRegistryService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new contract with ABI' })
  @ApiResponse({ status: 201, description: 'Contract registered successfully' })
  async registerContract(
    @Request() req: any,
    @Body() registrationRequest: ContractRegistrationRequest,
  ) {
    try {
      const contract = await this.contractRegistryService.registerContract(registrationRequest);
      
      return {
        success: true,
        message: 'Contract registered successfully',
        contract,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to register contract',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':contractId')
  @ApiOperation({ summary: 'Get contract details' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({ status: 200, description: 'Contract details retrieved successfully' })
  async getContract(@Param('contractId') contractId: string) {
    try {
      const contract = await this.contractRegistryService.getContract(contractId);
      
      if (!contract) {
        return {
          success: false,
          message: 'Contract not found',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        contract,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get contract',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':contractId/abi/latest')
  @ApiOperation({ summary: 'Get latest ABI for contract' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({ status: 200, description: 'Latest ABI retrieved successfully' })
  async getLatestAbi(@Param('contractId') contractId: string) {
    try {
      const abi = await this.contractRegistryService.getLatestAbi(contractId);
      
      if (!abi) {
        return {
          success: false,
          message: 'ABI not found for contract',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        abi,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get ABI',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':contractId/abi/:version')
  @ApiOperation({ summary: 'Get specific ABI version' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiParam({ name: 'version', description: 'ABI version' })
  @ApiResponse({ status: 200, description: 'ABI version retrieved successfully' })
  async getAbiVersion(
    @Param('contractId') contractId: string,
    @Param('version') version: string,
  ) {
    try {
      const abi = await this.contractRegistryService.getAbiVersion(contractId, version);
      
      if (!abi) {
        return {
          success: false,
          message: 'ABI version not found',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        abi,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get ABI version',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Put(':contractId/abi')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update contract ABI' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({ status: 200, description: 'ABI updated successfully' })
  async updateContractAbi(
    @Param('contractId') contractId: string,
    @Body() updateRequest: AbiUpdateRequest,
  ) {
    try {
      const abi = await this.contractRegistryService.updateContractAbi(contractId, updateRequest);
      
      return {
        success: true,
        message: 'ABI updated successfully',
        abi,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update ABI',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':contractId/abi/versions')
  @ApiOperation({ summary: 'Get all ABI versions for contract' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'isLatest', required: false, type: Boolean, description: 'Filter by latest version' })
  @ApiResponse({ status: 200, description: 'ABI versions retrieved successfully' })
  async getAbiVersions(
    @Param('contractId') contractId: string,
    @Query() filter: AbiVersionFilter,
  ) {
    try {
      const versions = await this.contractRegistryService.getAbiVersions(contractId, filter);
      
      return {
        success: true,
        versions,
        count: versions.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get ABI versions',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Search contracts' })
  @ApiQuery({ name: 'network', required: false, type: String, description: 'Filter by network' })
  @ApiQuery({ name: 'verified', required: false, type: Boolean, description: 'Filter by verification status' })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'name', required: false, type: String, description: 'Filter by name (contains)' })
  @ApiQuery({ name: 'hasAbi', required: false, type: Boolean, description: 'Filter by ABI presence' })
  @ApiResponse({ status: 200, description: 'Contracts retrieved successfully' })
  async searchContracts(@Query() filter: ContractSearchFilter) {
    try {
      const contracts = await this.contractRegistryService.searchContracts(filter);
      
      return {
        success: true,
        contracts,
        count: contracts.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to search contracts',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get contract registry statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getRegistryStats() {
    try {
      const stats = await this.contractRegistryService.getRegistryStats();
      
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get statistics',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post(':contractId/validate-event')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate event against contract ABI' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({ status: 200, description: 'Event validation completed' })
  async validateEvent(
    @Param('contractId') contractId: string,
    @Body() body: { eventTopic: string; eventData: Record<string, unknown> },
  ) {
    try {
      const validation = await this.contractRegistryService.validateEvent(
        contractId,
        body.eventTopic,
        body.eventData,
      );
      
      return {
        success: true,
        validation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to validate event',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Put(':contractId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate contract' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({ status: 200, description: 'Contract deactivated successfully' })
  async deactivateContract(@Param('contractId') contractId: string) {
    try {
      await this.contractRegistryService.deactivateContract(contractId);
      
      return {
        success: true,
        message: 'Contract deactivated successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to deactivate contract',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Put(':contractId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify contract' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({ status: 200, description: 'Contract verified successfully' })
  async verifyContract(@Param('contractId') contractId: string) {
    try {
      await this.contractRegistryService.verifyContract(contractId);
      
      return {
        success: true,
        message: 'Contract verified successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to verify contract',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
