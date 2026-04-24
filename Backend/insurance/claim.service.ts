import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { ClaimStatus, AssessmentStage } from '@prisma/client';
import { IpfsService } from './ipfs.service';
import { ParametricAssessmentService } from './parametric-assessment.service';
import { PoolService } from './pool.service';

@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ipfsService: IpfsService,
    private readonly parametricService: ParametricAssessmentService,
    private readonly poolService: PoolService,
  ) {}

  // ==========================================
  // CLAIM SUBMISSION
  // ==========================================

  async submitClaim(
    policyId: string,
    claimAmount: number,
    isParametric: boolean = false,
    parametricTriggerData?: any,
  ) {
    this.logger.log(`Submitting claim for policy: ${policyId}`);

    const policy = await this.prisma.insurancePolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new NotFoundException(`Policy ${policyId} not found`);
    }

    if (policy.status !== 'ACTIVE') {
      throw new BadRequestException(`Policy ${policyId} is not active`);
    }

    const claim = await this.prisma.claim.create({
      data: {
        policyId,
        poolId: policy.poolId,
        claimAmount: claimAmount,
        status: 'PENDING',
        isParametric,
        currentStage: isParametric ? 'INITIAL_REVIEW' : undefined,
        parametricTriggerData: parametricTriggerData || null,
        submittedAt: new Date(),
      },
    });

    this.logger.log(`Claim submitted successfully: ${claim.id}`);
    return claim;
  }

  // ==========================================
  // MULTI-STAGE WORKFLOW ENGINE
  // ==========================================

  /**
   * Advance claim to next assessment stage
   */
  async advanceStage(
    claimId: string,
    stage: AssessmentStage,
    assessorId: string,
    notes?: string,
    score?: number,
  ) {
    this.logger.log(`Advancing claim ${claimId} to stage: ${stage}`);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { policy: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    // Validate stage progression
    this.validateStageTransition(claim.currentStage, stage);

    // Create assessment record
    const assessment = await this.prisma.claimAssessment.create({
      data: {
        claimId,
        assessorId,
        stage,
        notes,
        score,
      },
    });

    // Update claim stage
    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        currentStage: stage,
        status: stage === 'FINAL_APPROVAL' ? 'REVIEWING' : claim.status,
        reviewedAt: stage === 'FINAL_APPROVAL' ? new Date() : claim.reviewedAt,
      },
      include: {
        assessments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.log(`Claim ${claimId} advanced to ${stage}`);
    return updatedClaim;
  }

  /**
   * Validate stage transition logic
   */
  private validateStageTransition(
    currentStage: AssessmentStage | null,
    nextStage: AssessmentStage,
  ): void {
    const stageOrder: AssessmentStage[] = [
      'INITIAL_REVIEW',
      'DOCUMENT_VERIFICATION',
      'RISK_ASSESSMENT',
      'FINAL_APPROVAL',
    ];

    const currentIndex = currentStage ? stageOrder.indexOf(currentStage) : -1;
    const nextIndex = stageOrder.indexOf(nextStage);

    if (nextIndex <= currentIndex) {
      throw new BadRequestException(
        `Invalid stage transition: ${currentStage} → ${nextStage}. Must progress forward.`,
      );
    }

    if (nextIndex !== currentIndex + 1) {
      throw new BadRequestException(
        `Cannot skip stages: ${currentStage} → ${nextStage}. Must advance one stage at a time.`,
      );
    }
  }

  /**
   * Final claim assessment (approve/reject)
   */
  async assessClaim(
    claimId: string,
    status: ClaimStatus,
    assessorId: string,
    payoutAmount?: number,
    notes?: string,
  ) {
    this.logger.log(`Assessing claim ${claimId}: ${status}`);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { policy: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('Final assessment must be APPROVED or REJECTED');
    }

    // Create final assessment record
    await this.prisma.claimAssessment.create({
      data: {
        claimId,
        assessorId,
        stage: 'FINAL_APPROVAL',
        decision: status,
        notes,
      },
    });

    const finalPayoutAmount =
      payoutAmount || (status === 'APPROVED' ? claim.claimAmount.toNumber() : 0);

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status,
        payoutAmount: finalPayoutAmount,
        resolvedAt: new Date(),
      },
    });

    // If approved, lock payout from pool
    if (status === 'APPROVED' && claim.poolId) {
      await this.poolService.lockCapital(claim.poolId, finalPayoutAmount);
    }

    this.logger.log(`Claim ${claimId} assessed: ${status}`);
    return updatedClaim;
  }

  /**
   * Process claim payment
   */
  async payClaim(claimId: string) {
    this.logger.log(`Processing payment for claim: ${claimId}`);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    if (claim.status !== 'APPROVED') {
      throw new BadRequestException(`Claim ${claimId} must be approved before payment`);
    }

    if (!claim.payoutAmount || claim.payoutAmount.toNumber() <= 0) {
      throw new BadRequestException(`Claim ${claimId} has no valid payout amount`);
    }

    const paidClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    this.logger.log(`Claim ${claimId} paid successfully`);
    return paidClaim;
  }

  // ==========================================
  // ASSESSOR ASSIGNMENT SYSTEM
  // ==========================================

  /**
   * Assign assessor to claim
   */
  async assignAssessor(claimId: string, assessorId: string) {
    this.logger.log(`Assigning assessor ${assessorId} to claim ${claimId}`);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    const assessor = await this.prisma.assessor.findUnique({
      where: { id: assessorId },
    });

    if (!assessor) {
      throw new NotFoundException(`Assessor ${assessorId} not found`);
    }

    if (!assessor.isActive) {
      throw new BadRequestException(`Assessor ${assessorId} is not active`);
    }

    if (assessor.workload >= assessor.maxConcurrentClaims) {
      throw new BadRequestException(`Assessor ${assessorId} has reached maximum workload`);
    }

    // Assign assessor and increment workload
    const [updatedClaim, updatedAssessor] = await this.prisma.$transaction([
      this.prisma.claim.update({
        where: { id: claimId },
        data: { assessorId },
      }),
      this.prisma.assessor.update({
        where: { id: assessorId },
        data: { workload: { increment: 1 } },
      }),
    ]);

    this.logger.log(`Assessor ${assessorId} assigned to claim ${claimId}`);
    return updatedClaim;
  }

  /**
   * Auto-assign best available assessor
   */
  async autoAssignAssessor(claimId: string): Promise<any> {
    this.logger.log(`Auto-assigning assessor for claim: ${claimId}`);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { policy: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    // Find available assessor with lowest workload
    const availableAssessor = await this.prisma.assessor.findFirst({
      where: {
        isActive: true,
      },
      orderBy: { workload: 'asc' },
    });

    // Filter client-side for workload < maxConcurrentClaims
    if (!availableAssessor || availableAssessor.workload >= availableAssessor.maxConcurrentClaims) {
      throw new BadRequestException('No available assessors at this time');
    }

    return this.assignAssessor(claimId, availableAssessor.id);
  }

  // ==========================================
  // EVIDENCE MANAGEMENT (IPFS)
  // ==========================================

  /**
   * Upload claim evidence to IPFS
   */
  async uploadEvidence(
    claimId: string,
    documentType: string,
    fileContent: Buffer | string,
    uploadedBy: string,
    description?: string,
  ) {
    this.logger.log(`Uploading evidence for claim: ${claimId}`);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    // Upload to IPFS
    const ipfsHash = await this.ipfsService.uploadFile(fileContent, {
      claimId,
      documentType,
      uploadedBy,
    });

    // Create evidence record
    const evidence = await this.prisma.claimEvidence.create({
      data: {
        claimId,
        ipfsHash,
        documentType,
        description,
        uploadedBy,
      },
    });

    this.logger.log(`Evidence uploaded to IPFS: ${ipfsHash}`);
    return {
      ...evidence,
      ipfsUrl: this.ipfsService.getGatewayUrl(ipfsHash),
    };
  }

  /**
   * Get all evidence for a claim
   */
  async getClaimEvidence(claimId: string) {
    const evidence = await this.prisma.claimEvidence.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });

    return evidence.map((e) => ({
      ...e,
      ipfsUrl: this.ipfsService.getGatewayUrl(e.ipfsHash),
    }));
  }

  // ==========================================
  // DISPUTE RESOLUTION WORKFLOW
  // ==========================================

  /**
   * Raise a dispute for a claim
   */
  async raiseDispute(claimId: string, raisedBy: string, reason: string) {
    this.logger.log(`Raising dispute for claim: ${claimId}`);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    if (claim.status === 'PAID') {
      throw new BadRequestException('Cannot dispute a paid claim');
    }

    // Update claim status to DISPUTED
    const [dispute, updatedClaim] = await this.prisma.$transaction([
      this.prisma.claimDispute.create({
        data: {
          claimId,
          raisedBy,
          reason,
          status: 'OPEN',
        },
      }),
      this.prisma.claim.update({
        where: { id: claimId },
        data: { status: 'DISPUTED' },
      }),
    ]);

    this.logger.log(`Dispute raised for claim ${claimId}: ${dispute.id}`);
    return { dispute, claim: updatedClaim };
  }

  /**
   * Resolve a dispute
   */
  async resolveDispute(
    disputeId: string,
    resolution: string,
    resolvedBy: string,
    newClaimStatus?: ClaimStatus,
  ) {
    this.logger.log(`Resolving dispute: ${disputeId}`);

    const dispute = await this.prisma.claimDispute.findUnique({
      where: { id: disputeId },
      include: { claim: true },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute ${disputeId} not found`);
    }

    // Resolve dispute
    const resolvedDispute = await this.prisma.claimDispute.update({
      where: { id: disputeId },
      data: {
        resolution,
        status: 'RESOLVED',
        resolvedBy,
        resolvedAt: new Date(),
      },
    });

    // Update claim status if provided
    const updatedClaim = newClaimStatus
      ? await this.prisma.claim.update({
          where: { id: dispute.claimId },
          data: { status: newClaimStatus },
        })
      : dispute.claim;

    this.logger.log(`Dispute ${disputeId} resolved`);
    return { dispute: resolvedDispute, claim: updatedClaim };
  }

  /**
   * Escalate a dispute
   */
  async escalateDispute(disputeId: string) {
    this.logger.log(`Escalating dispute: ${disputeId}`);

    const dispute = await this.prisma.claimDispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute ${disputeId} not found`);
    }

    const escalatedDispute = await this.prisma.claimDispute.update({
      where: { id: disputeId },
      data: { status: 'ESCALATED' },
    });

    this.logger.log(`Dispute ${disputeId} escalated`);
    return escalatedDispute;
  }

  // ==========================================
  // QUERY METHODS
  // ==========================================

  async getClaimsByPolicy(policyId: string) {
    return this.prisma.claim.findMany({
      where: { policyId },
      include: {
        assessments: {
          orderBy: { createdAt: 'desc' },
        },
        evidence: true,
        disputes: true,
        assessor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getClaimById(claimId: string) {
    return this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        policy: true,
        assessments: {
          orderBy: { createdAt: 'desc' },
        },
        evidence: true,
        disputes: true,
        assessor: true,
      },
    });
  }

  async getClaimsByStatus(status: ClaimStatus) {
    return this.prisma.claim.findMany({
      where: { status },
      include: {
        policy: true,
        assessor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
