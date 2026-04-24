# Stellara Storage Gateway

A comprehensive decentralized storage gateway service providing seamless access to IPFS, Arweave, and Filecoin with intelligent caching, automatic failover, and content verification.

## Features

### Multi-Network Abstraction
- **IPFS**: Distributed file storage with pinning support
- **Arweave**: Permanent, censorship-resistant storage
- **Filecoin**: Decentralized storage with deal-based pricing

### Intelligent Caching Layer
- **Memory Cache**: Fast in-memory caching with LRU eviction
- **Redis Cache**: Distributed caching for scalability
- **Cache Hit Rate Optimization**: Popular content automatically cached

### Content Integrity Verification
- **SHA-256 Hashing**: Default content verification
- **Multiple Algorithms**: Support for SHA-1, MD5, SHA-384, SHA-512
- **Chunked Verification**: Efficient verification for large files
- **Content Type Detection**: Automatic MIME type detection

### Automatic Retry and Failover
- **Multiple Strategies**: Parallel, sequential, and fastest-first failover
- **Circuit Breaker**: Automatic provider health monitoring
- **Latency-Based Routing**: Route to fastest available provider
- **Error Rate Tracking**: Provider performance analytics

### Cost Optimization
- **Storage Tiers**: Cold, Standard, and Hot storage options
- **Dynamic Pricing**: Real-time cost estimation
- **Provider Selection**: Automatic cheapest provider selection
- **Replication Management**: Optimal replication factor based on tier

### Gateway Status Dashboard
- **Real-time Metrics**: Upload/retrieval statistics
- **Provider Status**: Live provider health monitoring
- **Performance Charts**: Visual analytics and trends
- **Activity Logs**: Recent operation tracking

## Quick Start

### Prerequisites
- Node.js 18+ 
- Redis (optional, for distributed caching)
- IPFS node (optional, for local pinning)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd storage-gateway

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit configuration
nano .env
```

### Configuration

Edit `.env` file with your settings:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# IPFS Configuration
IPFS_NODE_URL=http://localhost:5001
IPFS_GATEWAY_URL=https://ipfs.io

# Arweave Configuration
ARWEAVE_GATEWAY_URL=https://arweave.net
ARWEAVE_WALLET_FILE=path/to/wallet.json

# Filecoin Configuration
FILECOIN_RPC_URL=https://api.node.glif.io/rpc/v1
FILECOIN_WALLET_ADDRESS=
```

### Running the Service

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

The service will be available at `http://localhost:3000`
Dashboard available at `http://localhost:3000/dashboard`

## API Documentation

### Upload Content

#### Upload Base64 Content
```bash
POST /api/v1/upload
Content-Type: application/json

{
  "content": "base64-encoded-content",
  "name": "example.txt",
  "contentType": "text/plain",
  "tier": "standard",
  "priority": "standard",
  "replicationFactor": 2,
  "optimizeCosts": true,
  "tags": {
    "category": "documents",
    "version": "1.0"
  }
}
```

#### Upload File
```bash
POST /api/v1/upload/file
Content-Type: multipart/form-data

file: <binary-file-data>
tier: standard
priority: high
optimizeCosts: true
```

### Retrieve Content

```bash
POST /api/v1/retrieve
Content-Type: application/json

{
  "identifier": "QmHashOrArweaveId",
  "preferredProvider": "ipfs",
  "useCache": true,
  "verifyHash": true,
  "timeout": 30000
}
```

### Pin Content

```bash
POST /api/v1/pin
Content-Type: application/json

{
  "identifier": "QmHashOrArweaveId",
  "provider": "ipfs"
}
```

### Verify Content

```bash
POST /api/v1/verify
Content-Type: application/json

{
  "identifier": "QmHashOrArweaveId",
  "expectedHash": "sha256-hash",
  "provider": "ipfs"
}
```

### Get Status

```bash
GET /api/v1/status
```

### Get Metrics

```bash
GET /api/v1/metrics
```

### Cost Estimation

```bash
GET /api/v1/cost-estimate?size=1024&tier=standard&duration=30
```

## Storage Tiers

### Cold Storage
- **Providers**: Arweave
- **Replication**: 1x
- **Retention**: 5 years
- **Cost**: 0.5x multiplier
- **Use Case**: Archival data, backups

### Standard Storage
- **Providers**: IPFS, Arweave
- **Replication**: 2x
- **Retention**: 1 year
- **Cost**: 1.0x multiplier
- **Use Case**: Regular files, documents

### Hot Storage
- **Providers**: IPFS, Filecoin
- **Replication**: 3x
- **Retention**: 90 days
- **Cost**: 1.5x multiplier
- **Use Case**: Active content, media

## Architecture

```
Client Request
    |
    v
API Layer (Express.js)
    |
    v
Storage Gateway Service
    |
    v
Failover Service
    |
    v
Provider Layer
    |     |     |
    v     v     v
IPFS  Arweave Filecoin
    |
    v
Cache Layer (Redis/Memory)
```

## Monitoring and Observability

### Health Checks
```bash
GET /api/v1/health
```

### Metrics Endpoint
- Upload/retrieval counts
- Success rates
- Latency metrics
- Cache hit rates
- Provider performance
- Cost tracking

### Dashboard Features
- Real-time status monitoring
- Performance charts
- Provider health indicators
- Activity logs
- Configuration management

## Development

### Project Structure
```
src/
|-- config/          # Configuration management
|-- controllers/      # API controllers
|-- middleware/       # Express middleware
|-- providers/        # Storage provider implementations
|-- routes/          # API routes
|-- services/        # Business logic services
|-- types/           # TypeScript type definitions
|-- utils/           # Utility functions
|-- index.ts         # Application entry point
```

### Testing
```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Linting
```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Security Considerations

- **Content Verification**: All content is hash-verified
- **Rate Limiting**: API endpoints are rate-limited
- **Input Validation**: Request validation with Joi
- **Secure Headers**: Helmet.js for security headers
- **CORS Protection**: Configurable CORS policies

## Performance Optimization

- **Caching Strategy**: Multi-tier caching for optimal performance
- **Connection Pooling**: Efficient resource management
- **Lazy Loading**: On-demand provider initialization
- **Batch Operations**: Support for bulk operations
- **Compression**: Gzip compression for responses

## Troubleshooting

### Common Issues

1. **IPFS Connection Failed**
   - Ensure IPFS node is running
   - Check IPFS node URL configuration
   - Verify network connectivity

2. **Redis Connection Failed**
   - Ensure Redis server is running
   - Check Redis connection parameters
   - Verify authentication credentials

3. **Arweave Upload Failed**
   - Check wallet file path
   - Verify wallet permissions
   - Ensure sufficient AR balance

4. **Filecoin Deal Failed**
   - Check RPC endpoint configuration
   - Verify wallet address
   - Ensure sufficient FIL balance

### Debug Mode
Enable debug logging by setting `LOG_LEVEL=debug` in `.env`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Documentation**: [API Docs](https://docs.stellara.ai/storage-gateway)
- **Issues**: [GitHub Issues](https://github.com/stellara/storage-gateway/issues)
- **Discussions**: [GitHub Discussions](https://github.com/stellara/storage-gateway/discussions)
