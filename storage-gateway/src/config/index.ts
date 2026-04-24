import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  ipfs: {
    nodeUrl: process.env.IPFS_NODE_URL || 'http://localhost:5001',
    gatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io',
    pinningNodes: JSON.parse(process.env.IPFS_PINNING_NODES || '["/ip4/127.0.0.1/tcp/4001"]'),
  },
  arweave: {
    gatewayUrl: process.env.ARWEAVE_GATEWAY_URL || 'https://arweave.net',
    walletFile: process.env.ARWEAVE_WALLET_FILE || '',
    apiUrl: process.env.ARWEAVE_API_URL || 'https://api.arweave.org',
  },
  filecoin: {
    rpcUrl: process.env.FILECOIN_RPC_URL || 'https://api.node.glif.io/rpc/v1',
    walletAddress: process.env.FILECOIN_WALLET_ADDRESS || '',
    apiToken: process.env.FILECOIN_API_TOKEN || '',
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '3600'),
    memoryCacheSize: parseInt(process.env.MEMORY_CACHE_SIZE || '100'),
    redisCacheEnabled: process.env.REDIS_CACHE_ENABLED === 'true',
  },
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000'),
    timeout: parseInt(process.env.TIMEOUT || '30000'),
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || 'logs/app.log',
  },
  costOptimization: {
    enabled: process.env.COST_OPTIMIZATION_ENABLED === 'true',
    preferredStorageTier: process.env.PREFERRED_STORAGE_TIER || 'standard',
    minReplicationFactor: parseInt(process.env.MIN_REPLICATION_FACTOR || '2'),
  },
  contentVerification: {
    enabled: process.env.CONTENT_VERIFICATION_ENABLED === 'true',
    hashAlgorithm: process.env.HASH_ALGORITHM || 'sha256',
  },
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED === 'true',
    port: parseInt(process.env.DASHBOARD_PORT || '3001'),
  },
};

export default config;
