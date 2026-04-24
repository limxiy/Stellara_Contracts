export interface CompetitionMetrics {
  totalReturn: number;
  totalVolume: number;
  sharpeRatio?: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
  averageTradeSize: number;
  volatility: number;
}

export interface LeaderboardEntry {
  userId: string;
  rank: number;
  score: number;
  metrics: CompetitionMetrics;
  lastUpdated: Date;
}

export interface AntiCheatAlert {
  type: string;
  severity: string;
  description: string;
  evidence: any;
  userId: string;
  competitionId: string;
}

export interface PrizeCalculation {
  rank: number;
  prizeAmount: number;
  percentage: number;
  userId: string;
}

export interface CompetitionResult {
  competitionId: string;
  finalStandings: LeaderboardEntry[];
  prizeDistributions: PrizeCalculation[];
  achievements: any[];
  disqualifiedParticipants: string[];
}
