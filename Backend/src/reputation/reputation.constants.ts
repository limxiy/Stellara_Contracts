/**
 * The categories of activity that contribute to a reputation score.
 * Keeping these as an enum means new activity types are added in one place
 * and the compiler catches any missing case in switch statements.
 */
export enum ActivityType {
  /** A transaction or job completed successfully by both parties. */
  SUCCESSFUL_TRANSACTION = 'SUCCESSFUL_TRANSACTION',
  /** A transaction that was abandoned, disputed, or failed. */
  FAILED_TRANSACTION = 'FAILED_TRANSACTION',
  /** A peer-to-peer rating submitted after a completed transaction. */
  PEER_RATING = 'PEER_RATING',
  /** A review or comment left on a listing / profile. */
  COMMUNITY_REVIEW = 'COMMUNITY_REVIEW',
  /** A dispute resolution decided in the subject's favour. */
  DISPUTE_WON = 'DISPUTE_WON',
  /** A dispute resolution decided against the subject. */
  DISPUTE_LOST = 'DISPUTE_LOST',
  /** A high-value contribution flagged by admins or automated scoring. */
  HIGH_VALUE_CONTRIBUTION = 'HIGH_VALUE_CONTRIBUTION',
  /** A project was successfully completed. */
  PROJECT_COMPLETION = 'PROJECT_COMPLETION',
  /** A milestone was achieved within a project. */
  MILESTONE_ACHIEVEMENT = 'MILESTONE_ACHIEVEMENT',
  /** A social interaction such as comment or review. */
  SOCIAL_INTERACTION = 'SOCIAL_INTERACTION',
  /** A comment marked as helpful by other users. */
  HELPFUL_COMMENT = 'HELPFUL_COMMENT',
  /** A milestone completed within a project. */
  MILESTONE_COMPLETED = 'MILESTONE_COMPLETED',
  /** A milestone that was delayed beyond its deadline. */
  MILESTONE_DELAYED = 'MILESTONE_DELAYED',
  /** A peer rating given by a verified expert in the field. */
  EXPERT_ENDORSEMENT = 'EXPERT_ENDORSEMENT',
  /** Participation in protocol governance voting. */
  GOVERNANCE_VOTE = 'GOVERNANCE_VOTE',
}

/**
 * Weights applied to each factor when computing the composite score.
 * All weights are relative — they do not need to sum to 1.
 *
 * Tune these constants without touching calculation logic.
 */
export const FACTOR_WEIGHTS = {
  SUCCESS_RATE: 0.2,
  PEER_RATING: 0.15,
  CONTRIBUTION_SIZE: 0.1,
  COMMUNITY_FEEDBACK: 0.1,
  RELIABILITY: 0.2,
  EXPERTISE: 0.15,
  COMMUNITY_CONTRIBUTION: 0.1,
} as const;

/**
 * Reputation level thresholds.
 * Users are assigned a level based on their composite score.
 */
export const REPUTATION_LEVELS = [
  { level: 'DIAMOND', minScore: 90 },
  { level: 'PLATINUM', minScore: 75 },
  { level: 'GOLD', minScore: 60 },
  { level: 'SILVER', minScore: 40 },
  { level: 'BRONZE', minScore: 0 },
] as const;

/**
 * Time-decay half-life in days.
 * After this many days an activity contributes half its original weight.
 * Older activities still count but have diminishing influence.
 */
export const DECAY_HALF_LIFE_DAYS = 180;

/** Composite scores are clamped to [MIN_SCORE, MAX_SCORE]. */
export const MIN_SCORE = 0;
export const MAX_SCORE = 100;

/**
 * Minimum number of activities required before a score is considered
 * statistically meaningful. Below this threshold the score is returned
 * alongside a `lowConfidence` flag.
 */
export const MIN_ACTIVITY_THRESHOLD = 5;

/**
 * Decay rates per activity type (half-life in days).
 * Different activity types decay at different rates based on their
 * relevance over time.
 */
export const DECAY_RATES_BY_ACTIVITY: Record<ActivityType, number> = {
  SUCCESSFUL_TRANSACTION: 180,    // 6 months - transactions stay relevant
  FAILED_TRANSACTION: 365,        // 1 year - failures have longer memory
  PEER_RATING: 180,               // 6 months - recent ratings matter more
  COMMUNITY_REVIEW: 120,          // 4 months - reviews decay faster
  DISPUTE_WON: 270,               // 9 months - dispute wins stay relevant
  DISPUTE_LOST: 365,              // 1 year - dispute losses have longer memory
  HIGH_VALUE_CONTRIBUTION: 180,   // 6 months - contributions stay relevant
  PROJECT_COMPLETION: 270,        // 9 months - project completions are significant
  MILESTONE_ACHIEVEMENT: 240,     // 8 months - milestones are moderately lasting
  SOCIAL_INTERACTION: 90,         // 3 months - social interactions decay quickly
  HELPFUL_COMMENT: 120,           // 4 months - helpful comments have medium relevance
} as const;

/**
 * Reputation score threshold for decay exemption.
 * Users with scores above this threshold are exempt from decay
 * to reward consistent high performers.
 */
export const DECAY_EXEMPTION_THRESHOLD = 850;

/**
 * Decay schedule configuration.
 * Controls how often decay calculations run.
 */
export const DECAY_SCHEDULE = {
  CRON_EXPRESSION: '0 2 * * *', // Daily at 2 AM
  BATCH_SIZE: 100,              // Process 100 users at a time
  ENABLE_DECREASE_RATE: true,   // Enable decreased reputation decay rate
} as const;
