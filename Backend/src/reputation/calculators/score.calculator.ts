import { ReputationActivity } from '@prisma/client';
import {
  FACTOR_WEIGHTS,
  MAX_SCORE,
  MIN_ACTIVITY_THRESHOLD,
  MIN_SCORE,
  ActivityType,
} from '../reputation.constants';
import { activityDecayWeight } from './decay.calculator';

// ---------------------------------------------------------------------------
// Intermediate result types
// ---------------------------------------------------------------------------

export interface FactorScores {
  successRateScore: number;
  peerRatingScore: number;
  contributionSizeScore: number;
  communityFeedbackScore: number;
  reliabilityScore: number;
  expertiseScore: number;
  communityScore: number;
}

export interface ScoreBreakdown extends FactorScores {
  compositeScore: number;
  activityCount: number;
  lowConfidence: boolean;
  level: string;
}

// ---------------------------------------------------------------------------
// Factor calculators
// ---------------------------------------------------------------------------

/**
 * Success-rate factor (0–100).
 *
 * Ratio of decay-weighted successful transactions to all transaction outcomes.
 * A perfect 100% success rate yields 100; 0% yields 0.
 */
export function calcSuccessRateScore(activities: ReputationActivity[], now: Date): number {
  const transactionTypes = new Set<ActivityType>([
    ActivityType.SUCCESSFUL_TRANSACTION,
    ActivityType.FAILED_TRANSACTION,
  ]);

  const transactions = activities.filter((a) => transactionTypes.has(a.activityType));
  if (transactions.length === 0) return 50; // neutral default — no data

  let weightedSuccess = 0;
  let weightedTotal = 0;

  for (const tx of transactions) {
    const w = activityDecayWeight(tx.occurredAt, tx.activityType, now);
    weightedTotal += w;
    if (tx.activityType === ActivityType.SUCCESSFUL_TRANSACTION) {
      weightedSuccess += w;
    }
  }

  return weightedTotal === 0 ? 50 : clamp((weightedSuccess / weightedTotal) * 100);
}

/**
 * Peer-rating factor (0–100).
 *
 * Decay-weighted mean of PEER_RATING values, normalised from a 1–5 scale
 * to 0–100. Falls back to 50 when no ratings exist.
 */
export function calcPeerRatingScore(activities: ReputationActivity[], now: Date): number {
  const ratings = activities.filter((a) => a.activityType === ActivityType.PEER_RATING);
  if (ratings.length === 0) return 50;

  let weightedSum = 0;
  let weightedTotal = 0;

  for (const r of ratings) {
    const w = activityDecayWeight(r.occurredAt, r.activityType, now);
    weightedSum += Number(r.value) * w;
    weightedTotal += w;
  }

  if (weightedTotal === 0) return 50;

  // Normalise 1–5 → 0–100
  const meanRating = weightedSum / weightedTotal;
  return clamp(((meanRating - 1) / 4) * 100);
}

/**
 * Contribution-size factor (0–100).
 *
 * Reward users who handle larger transactions and high-value contributions.
 */
export function calcContributionSizeScore(activities: ReputationActivity[], now: Date): number {
  const contributionTypes = new Set<ActivityType>([
    ActivityType.SUCCESSFUL_TRANSACTION,
    ActivityType.HIGH_VALUE_CONTRIBUTION,
  ]);

  const relevant = activities.filter((a) => contributionTypes.has(a.activityType));
  if (relevant.length === 0) return 0;

  let weightedValue = 0;
  for (const a of relevant) {
    weightedValue += Number(a.value) * activityDecayWeight(a.occurredAt, a.activityType, now);
  }

  const SCALE_CAP = 10_000;
  return clamp((Math.log10(1 + weightedValue) / Math.log10(1 + SCALE_CAP)) * 100);
}

/**
 * Community-feedback factor (0–100).
 *
 * Combines COMMUNITY_REVIEW ratings and dispute outcomes.
 */
export function calcCommunityFeedbackScore(activities: ReputationActivity[], now: Date): number {
  const reviews = activities.filter((a) => a.activityType === ActivityType.COMMUNITY_REVIEW);
  const disputes = activities.filter(
    (a) =>
      a.activityType === ActivityType.DISPUTE_WON || a.activityType === ActivityType.DISPUTE_LOST,
  );

  if (reviews.length === 0 && disputes.length === 0) return 50;

  let reviewScore = 50;
  if (reviews.length > 0) {
    let wSum = 0,
      wTotal = 0;
    for (const r of reviews) {
      const w = activityDecayWeight(r.occurredAt, r.activityType, now);
      wSum += Number(r.value) * w;
      wTotal += w;
    }
    reviewScore = wTotal > 0 ? clamp(((wSum / wTotal - 1) / 4) * 100) : 50;
  }

  let disputeScore = 50;
  if (disputes.length > 0) {
    let wWon = 0,
      wLost = 0;
    for (const d of disputes) {
      const w = activityDecayWeight(d.occurredAt, d.activityType, now);
      if (d.activityType === ActivityType.DISPUTE_WON) wWon += w;
      else wLost += w;
    }
    const total = wWon + wLost;
    disputeScore = total > 0 ? clamp((wWon / total) * 100) : 50;
  }

  const reviewWeight = reviews.length > 0 ? 0.7 : 0;
  const disputeWeight = disputes.length > 0 ? 0.3 : 0;
  const totalWeight = reviewWeight + disputeWeight;

  if (totalWeight === 0) return 50;
  return clamp((reviewScore * reviewWeight + disputeScore * disputeWeight) / totalWeight);
}

/**
 * Reliability factor (0–100).
 *
 * Based on milestone completion vs delays.
 */
export function calcReliabilityScore(activities: ReputationActivity[], now: Date): number {
  const reliabilityTypes = new Set<ActivityType>([
    ActivityType.MILESTONE_COMPLETED,
    ActivityType.MILESTONE_DELAYED,
  ]);

  const relevant = activities.filter((a) => reliabilityTypes.has(a.activityType));
  if (relevant.length === 0) return 50;

  let weightedOnTime = 0;
  let weightedTotal = 0;

  for (const a of relevant) {
    const w = timeDecayWeight(a.occurredAt, now);
    weightedTotal += w;
    if (a.activityType === ActivityType.MILESTONE_COMPLETED) {
      weightedOnTime += w;
    }
  }

  return weightedTotal === 0 ? 50 : clamp((weightedOnTime / weightedTotal) * 100);
}

/**
 * Expertise factor (0–100).
 *
 * Based on successful transactions, high-value contributions, and expert endorsements.
 */
export function calcExpertiseScore(activities: ReputationActivity[], now: Date): number {
  const expertiseTypes = new Set<ActivityType>([
    ActivityType.SUCCESSFUL_TRANSACTION,
    ActivityType.HIGH_VALUE_CONTRIBUTION,
    ActivityType.EXPERT_ENDORSEMENT,
  ]);

  const relevant = activities.filter((a) => expertiseTypes.has(a.activityType));
  if (relevant.length === 0) return 0;

  let weightedScore = 0;
  for (const a of relevant) {
    const w = timeDecayWeight(a.occurredAt, now);
    let val = Number(a.value);
    if (a.activityType === ActivityType.EXPERT_ENDORSEMENT) {
      val *= 10; // Endorsements are highly valuable
    }
    weightedScore += val * w;
  }

  const EXPERTISE_CAP = 25_000;
  return clamp((Math.log10(1 + weightedScore) / Math.log10(1 + EXPERTISE_CAP)) * 100);
}

/**
 * Community Contribution factor (0–100).
 *
 * Based on peer ratings, community reviews, and governance participation.
 */
export function calcCommunityContributionScore(activities: ReputationActivity[], now: Date): number {
  const communityTypes = new Set<ActivityType>([
    ActivityType.PEER_RATING,
    ActivityType.COMMUNITY_REVIEW,
    ActivityType.GOVERNANCE_VOTE,
  ]);

  const relevant = activities.filter((a) => communityTypes.has(a.activityType));
  if (relevant.length === 0) return 50;

  let weightedScore = 0;
  let weightedTotal = 0;

  for (const a of relevant) {
    const w = timeDecayWeight(a.occurredAt, now);
    weightedTotal += w;
    let val = Number(a.value);
    if (a.activityType === ActivityType.GOVERNANCE_VOTE) {
      val = 5; // Fixed value for voting
    }
    weightedScore += val * w;
  }

  if (weightedTotal === 0) return 50;
  const meanVal = weightedScore / weightedTotal;
  return clamp(((meanVal - 1) / 4) * 100);
}

// ---------------------------------------------------------------------------
// Composite calculator
// ---------------------------------------------------------------------------

/**
 * Compute the full multi-factor reputation score for a set of activities.
 */
export function calculateReputationScore(
  activities: ReputationActivity[],
  now: Date = new Date(),
): ScoreBreakdown {
  const activityCount = activities.length;
  const lowConfidence = activityCount < MIN_ACTIVITY_THRESHOLD;

  const successRateScore = calcSuccessRateScore(activities, now);
  const peerRatingScore = calcPeerRatingScore(activities, now);
  const contributionSizeScore = calcContributionSizeScore(activities, now);
  const communityFeedbackScore = calcCommunityFeedbackScore(activities, now);
  const reliabilityScore = calcReliabilityScore(activities, now);
  const expertiseScore = calcExpertiseScore(activities, now);
  const communityScore = calcCommunityContributionScore(activities, now);

  const compositeScore = clamp(
    successRateScore * FACTOR_WEIGHTS.SUCCESS_RATE +
      peerRatingScore * FACTOR_WEIGHTS.PEER_RATING +
      contributionSizeScore * FACTOR_WEIGHTS.CONTRIBUTION_SIZE +
      communityFeedbackScore * FACTOR_WEIGHTS.COMMUNITY_FEEDBACK +
      reliabilityScore * FACTOR_WEIGHTS.RELIABILITY +
      expertiseScore * FACTOR_WEIGHTS.EXPERTISE +
      communityScore * FACTOR_WEIGHTS.COMMUNITY_CONTRIBUTION,
  );

  const level = REPUTATION_LEVELS.find((l) => compositeScore >= l.minScore)?.level ?? 'BRONZE';

  return {
    compositeScore: round(compositeScore),
    successRateScore: round(successRateScore),
    peerRatingScore: round(peerRatingScore),
    contributionSizeScore: round(contributionSizeScore),
    communityFeedbackScore: round(communityFeedbackScore),
    reliabilityScore: round(reliabilityScore),
    expertiseScore: round(expertiseScore),
    communityScore: round(communityScore),
    activityCount,
    lowConfidence,
    level,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(value: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, value));
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
