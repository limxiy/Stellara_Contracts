import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
} from '@nestjs/common';
import { 
  QuadraticFundingService, 
  RetroactiveFundingService,
  ImpactCertificateService,
  MatchingPoolService,
  ImpactTrackingService,
  IntegrationService,
} from './services';
import { 
  CreateFundingRoundDto,
  ContributeToProjectDto,
  CreateRetroactiveFundingDto,
  IssueImpactCertificateDto,
  CreateMatchingPoolDto,
  RecordImpactMetricDto,
  ConfigureIntegrationDto,
} from './dto';

@Controller('regenerative-finance')
export class RegenerativeFinanceController {
  constructor(
    private quadraticFundingService: QuadraticFundingService,
    private retroactiveFundingService: RetroactiveFundingService,
    private impactCertificateService: ImpactCertificateService,
    private matchingPoolService: MatchingPoolService,
    private impactTrackingService: ImpactTrackingService,
    private integrationService: IntegrationService,
  ) {}

  // Quadratic Funding Endpoints
  @Post('funding-rounds')
  async createFundingRound(@Body() data: CreateFundingRoundDto) {
    return this.quadraticFundingService.createFundingRound(data);
  }

  @Put('funding-rounds/:id/start')
  async startFundingRound(@Param('id') id: string) {
    return this.quadraticFundingService.startFundingRound(id);
  }

  @Put('funding-rounds/:id/end')
  async endFundingRound(@Param('id') id: string) {
    return this.quadraticFundingService.endFundingRound(id);
  }

  @Post('funding-rounds/:roundId/projects')
  async addProjectToRound(
    @Param('roundId') roundId: string,
    @Body('projectId') projectId: string,
  ) {
    return this.quadraticFundingService.addProjectToRound(roundId, projectId);
  }

  @Post('contributions')
  async contributeToProject(@Body() data: ContributeToProjectDto) {
    return this.quadraticFundingService.contributeToProject(data);
  }

  @Get('funding-rounds')
  async getFundingRounds(@Query('status') status?: string) {
    if (status === 'active') {
      return this.quadraticFundingService.getActiveFundingRounds();
    }
    return [];
  }

  @Get('funding-rounds/:id')
  async getFundingRound(@Param('id') id: string) {
    return this.quadraticFundingService.getFundingRound(id);
  }

  @Get('funding-rounds/:id/results')
  async getFundingRoundResults(@Param('id') id: string) {
    return this.quadraticFundingService.getFundingRoundResults(id);
  }

  // Retroactive Funding Endpoints
  @Post('retroactive-funding')
  async createRetroactiveFunding(@Body() data: CreateRetroactiveFundingDto) {
    return this.retroactiveFundingService.createRetroactiveFunding(data);
  }

  @Post('retroactive-funding/evaluate')
  async evaluateProjectImpact(@Body() data: CreateRetroactiveFundingDto) {
    return this.retroactiveFundingService.evaluateProjectImpact(data);
  }

  @Put('retroactive-funding/:id/approve')
  async approveFunding(
    @Param('id') id: string,
    @Body('approverAddress') approverAddress: string,
  ) {
    return this.retroactiveFundingService.approveFunding(id, approverAddress);
  }

  @Put('retroactive-funding/:id/reject')
  async rejectFunding(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.retroactiveFundingService.rejectFunding(id, reason);
  }

  @Get('retroactive-funding/pending')
  async getPendingEvaluations() {
    return this.retroactiveFundingService.getPendingEvaluations();
  }

  @Get('retroactive-funding/project/:projectId')
  async getProjectFundingHistory(@Param('projectId') projectId: string) {
    return this.retroactiveFundingService.getProjectFundingHistory(projectId);
  }

  @Get('retroactive-funding/top-projects')
  async getTopImpactProjects(@Query('limit') limit?: number) {
    return this.retroactiveFundingService.getTopImpactProjects(limit);
  }

  @Get('retroactive-funding/impact-report')
  async getImpactReport(@Query() timeRange?: { start: string; end: string }) {
    const range = timeRange ? {
      start: new Date(timeRange.start),
      end: new Date(timeRange.end),
    } : undefined;
    
    return this.retroactiveFundingService.getImpactReport(range);
  }

  // Impact Certificate Endpoints
  @Post('impact-certificates')
  async issueImpactCertificate(@Body() data: IssueImpactCertificateDto) {
    return this.impactCertificateService.issueImpactCertificate(data);
  }

  @Put('impact-certificates/:id/transfer')
  async transferCertificate(
    @Param('id') id: string,
    @Body() transferData: { fromAddress: string; toAddress: string },
  ) {
    return this.impactCertificateService.transferCertificate(
      id,
      transferData.fromAddress,
      transferData.toAddress,
    );
  }

  @Put('impact-certificates/:id/burn')
  async burnCertificate(
    @Param('id') id: string,
    @Body('holderAddress') holderAddress: string,
  ) {
    return this.impactCertificateService.burnCertificate(id, holderAddress);
  }

  @Get('impact-certificates/token/:tokenId')
  async getCertificateByTokenId(@Param('tokenId') tokenId: string) {
    return this.impactCertificateService.getCertificateByTokenId(tokenId);
  }

  @Get('impact-certificates/holder/:address')
  async getCertificatesByHolder(@Param('address') address: string) {
    return this.impactCertificateService.getCertificatesByHolder(address);
  }

  @Get('impact-certificates/project/:projectId')
  async getCertificatesByProject(@Param('projectId') projectId: string) {
    return this.impactCertificateService.getCertificatesByProject(projectId);
  }

  @Get('impact-certificates/round/:roundId')
  async getCertificatesByRound(@Param('roundId') roundId: string) {
    return this.impactCertificateService.getCertificatesByRound(roundId);
  }

  @Get('impact-certificates/portfolio/:address')
  async getImpactPortfolio(@Param('address') address: string) {
    return this.impactCertificateService.getImpactPortfolio(address);
  }

  @Get('impact-certificates/search')
  async searchCertificates(@Query() filters: any) {
    return this.impactCertificateService.searchCertificates(filters);
  }

  // Matching Pool Endpoints
  @Post('matching-pools')
  async createMatchingPool(@Body() data: CreateMatchingPoolDto) {
    return this.matchingPoolService.createMatchingPool(data);
  }

  @Post('matching-pools/:poolId/allocate')
  async allocateToRound(
    @Param('poolId') poolId: string,
    @Body() allocationData: { fundingRoundId: string; amount: string },
  ) {
    return this.matchingPoolService.allocateToRound({
      matchingPoolId: poolId,
      fundingRoundId: allocationData.fundingRoundId,
      amount: BigInt(allocationData.amount),
    });
  }

  @Post('matching-pools/:poolId/funds')
  async addFundsToPool(
    @Param('poolId') poolId: string,
    @Body('amount') amount: string,
  ) {
    return this.matchingPoolService.addFundsToPool(poolId, BigInt(amount));
  }

  @Post('matching-pools/:poolId/withdraw')
  async withdrawFromPool(
    @Param('poolId') poolId: string,
    @Body() withdrawalData: { amount: string; reason: string },
  ) {
    return this.matchingPoolService.withdrawFromPool(
      poolId,
      BigInt(withdrawalData.amount),
      withdrawalData.reason,
    );
  }

  @Get('matching-pools')
  async getMatchingPools(@Query('active') active?: string) {
    if (active === 'true') {
      return this.matchingPoolService.getActivePools();
    }
    return [];
  }

  @Get('matching-pools/:id')
  async getMatchingPool(@Param('id') id: string) {
    return this.matchingPoolService.getMatchingPool(id);
  }

  @Get('matching-pools/:id/statistics')
  async getPoolStatistics(@Param('id') id: string) {
    return this.matchingPoolService.getPoolStatistics(id);
  }

  @Get('matching-pools/protocol-fees')
  async getProtocolFeesPool() {
    return this.matchingPoolService.getProtocolFeesPool();
  }

  @Post('matching-pools/protocol-fees/auto-fund')
  async autoFundFromProtocolFees(@Body('protocolRevenue') protocolRevenue: string) {
    return this.matchingPoolService.autoFundFromProtocolFees(BigInt(protocolRevenue));
  }

  @Post('matching-pools/:id/distribute')
  async distributeToActiveRounds(@Param('id') id: string) {
    return this.matchingPoolService.distributeToActiveRounds(id);
  }

  // Impact Tracking Endpoints
  @Post('impact-metrics')
  async recordImpactMetric(@Body() data: RecordImpactMetricDto) {
    return this.impactTrackingService.recordImpactMetric(data);
  }

  @Put('impact-metrics/:id/verify')
  async verifyMetric(
    @Param('id') id: string,
    @Body('verificationSource') verificationSource: string,
  ) {
    return this.impactTrackingService.verifyMetric(id, verificationSource);
  }

  @Get('impact-metrics/project/:projectId')
  async getProjectMetrics(@Param('projectId') projectId: string) {
    return this.impactTrackingService.getProjectMetrics(projectId);
  }

  @Get('impact-metrics/cumulative/:projectId')
  async getCumulativeImpact(@Param('projectId') projectId: string) {
    return this.impactTrackingService.getCumulativeImpact(projectId);
  }

  @Get('impact-metrics/summary')
  async getImpactSummary(@Query() timeRange?: { start: string; end: string }) {
    const range = timeRange ? {
      start: new Date(timeRange.start),
      end: new Date(timeRange.end),
    } : undefined;
    
    return this.impactTrackingService.getImpactSummary(range);
  }

  @Get('impact-metrics/top-projects')
  async getTopImpactProjects(@Query('limit') limit?: number) {
    return this.impactTrackingService.getTopImpactProjects(limit);
  }

  // Integration Endpoints
  @Post('integrations/configure')
  async configureIntegration(@Body() data: ConfigureIntegrationDto) {
    return this.integrationService.configureIntegration(data);
  }

  @Post('integrations/gitcoin/sync')
  async syncWithGitcoin() {
    return this.integrationService.syncWithGitcoin();
  }

  @Post('integrations/clr-fund/sync')
  async syncWithClrFund() {
    return this.integrationService.syncWithClrFund();
  }

  @Post('integrations/github/import')
  async importGithubProjects(@Body() data: { token: string; organization?: string }) {
    return this.integrationService.importGithubProjects(data.token, data.organization);
  }

  @Get('integrations/status')
  async getIntegrationStatus() {
    return this.integrationService.getIntegrationStatus();
  }

  @Put('integrations/:platform/disable')
  async disableIntegration(@Param('platform') platform: string) {
    return this.integrationService.disableIntegration(platform as any);
  }

  @Put('integrations/:platform/enable')
  async enableIntegration(@Param('platform') platform: string) {
    return this.integrationService.enableIntegration(platform as any);
  }

  // Dashboard Endpoints
  @Get('dashboard/overview')
  async getDashboardOverview() {
    const [
      activeRounds,
      pendingEvaluations,
      topProjects,
      impactSummary,
      protocolPool,
    ] = await Promise.all([
      this.quadraticFundingService.getActiveFundingRounds(),
      this.retroactiveFundingService.getPendingEvaluations(),
      this.retroactiveFundingService.getTopImpactProjects(5),
      this.impactTrackingService.getImpactSummary(),
      this.matchingPoolService.getProtocolFeesPool(),
    ]);

    return {
      activeFundingRounds: activeRounds.length,
      pendingEvaluations: pendingEvaluations.length,
      topProjects: topProjects.slice(0, 3),
      impactSummary,
      protocolPoolStatus: protocolPool ? {
        totalAmount: protocolPool.totalAmount,
        allocatedAmount: protocolPool.allocatedAmount,
        availableAmount: protocolPool.totalAmount - protocolPool.allocatedAmount,
      } : null,
    };
  }

  @Get('dashboard/fund-allocation')
  async getFundAllocation() {
    const [activePools, recentRounds] = await Promise.all([
      this.matchingPoolService.getActivePools(),
      this.quadraticFundingService.getActiveFundingRounds(),
    ]);

    return {
      matchingPools: activePools.map(pool => ({
        id: pool.id,
        name: pool.name,
        totalAmount: pool.totalAmount,
        allocatedAmount: pool.allocatedAmount,
        availableAmount: pool.totalAmount - pool.allocatedAmount,
        source: pool.source,
      })),
      activeRounds: recentRounds.map(round => ({
        id: round.id,
        title: round.title,
        type: round.type,
        startTime: round.startTime,
        endTime: round.endTime,
        matchingPool: round.matchingPool,
        totalContributions: round.totalContributions,
        projectsCount: round.projects.length,
      })),
    };
  }
}
