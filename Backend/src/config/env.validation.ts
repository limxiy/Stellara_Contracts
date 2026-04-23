import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  Max,
  Min,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsString()
  API_PREFIX: string;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsString()
  IPFS_HOST: string;

  @IsNumber()
  IPFS_PORT: number;

  @IsString()
  IPFS_PROTOCOL: string;

  @IsOptional()
  @IsString()
  IPFS_API_KEY?: string;

  @IsString()
  JWT_SECRET: string;

  @IsNumber()
  JWT_EXPIRATION: number;

  @IsString()
  STELLAR_NETWORK: string;

  @IsString()
  STELLAR_RPC_URL: string;

  @IsString()
  STELLAR_NETWORK_PASSPHRASE: string;

  @IsString()
  PROJECT_LAUNCH_CONTRACT_ID: string;

  @IsString()
  ESCROW_CONTRACT_ID: string;

  @IsOptional()
  @IsString()
  PROFIT_DISTRIBUTION_CONTRACT_ID?: string;

  @IsOptional()
  @IsString()
  SUBSCRIPTION_POOL_CONTRACT_ID?: string;

  @IsOptional()
  @IsString()
  GOVERNANCE_CONTRACT_ID?: string;

  @IsOptional()
  @IsString()
  REPUTATION_CONTRACT_ID?: string;

  @IsNumber()
  @Min(1000)
  @Max(60000)
  INDEXER_POLL_INTERVAL_MS: number;

  @IsNumber()
  INDEXER_REORG_DEPTH_THRESHOLD: number;

  @IsOptional()
  @IsNumber()
  INDEXER_MAX_EVENTS_PER_FETCH?: number;

  @IsOptional()
  @IsNumber()
  INDEXER_RETRY_ATTEMPTS?: number;

  @IsOptional()
  @IsNumber()
  INDEXER_RETRY_DELAY_MS?: number;

  @IsOptional()
  @IsBoolean()
  EMAIL_NOTIFICATIONS_ENABLED?: boolean;

  @IsOptional()
  @IsString()
  SENDGRID_API_KEY?: string;

  @IsOptional()
  @IsString()
  SENDGRID_FROM_EMAIL?: string;

  @IsOptional()
  @IsNumber()
  EMAIL_OUTBOX_ALERT_THRESHOLD?: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
