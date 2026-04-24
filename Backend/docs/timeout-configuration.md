# Backend Timeout Configuration

## Overview
This document outlines the timeout configurations implemented across all external service integrations to prevent hanging requests and improve system reliability.

## Timeout Configurations

### HTTP Request Timeout (`HTTP_REQUEST_TIMEOUT_MS`)
- **Default**: 30000ms (30 seconds)
- **Applied to**: All incoming API requests via `TimeoutMiddleware`
- **Purpose**: Prevents long-running requests from blocking the event loop
- **Behavior**: Throws `RequestTimeoutException` when exceeded

### Database Query Timeout (`DATABASE_STATEMENT_TIMEOUT_MS`)
- **Default**: 30000ms (30 seconds)
- **Applied to**: All PostgreSQL queries via Prisma
- **Purpose**: Prevents slow database queries from hanging
- **Implementation**: Uses PostgreSQL `statement_timeout` parameter

### Stellar RPC Timeout (`STELLAR_RPC_TIMEOUT_MS`)
- **Default**: 10000ms (10 seconds)
- **Applied to**: SorobanRpc.Server client in indexer service
- **Purpose**: Prevents RPC calls to Stellar network from hanging
- **Implementation**: SorobanRpc.Server `timeout` option

### SendGrid API Timeout (`SENDGRID_TIMEOUT_MS`)
- **Default**: 15000ms (15 seconds)
- **Applied to**: SendGrid email API calls
- **Purpose**: Prevents email delivery from blocking
- **Implementation**: `@sendgrid/mail` `setTimeout()` method

### IPFS Client Timeout (`IPFS_TIMEOUT_MS`)
- **Default**: 30000ms (30 seconds)
- **Applied to**: IPFS HTTP client operations
- **Purpose**: Prevents IPFS uploads/downloads from hanging
- **Implementation**: `ipfs-http-client` timeout configuration

## Environment Variables

Add these to your `.env` file:

```bash
# Timeout Configurations
HTTP_REQUEST_TIMEOUT_MS=30000
DATABASE_STATEMENT_TIMEOUT_MS=30000
IPFS_TIMEOUT_MS=30000
SENDGRID_TIMEOUT_MS=15000
STELLAR_RPC_TIMEOUT_MS=10000
```

## Monitoring and Alerting

### Timeout Metrics
- Request timeout exceptions are logged with correlation IDs
- Database query timeouts are logged as errors
- External service timeouts trigger health check failures

### Health Checks
- Health service checks include timeout validation
- Circuit breaker activates on repeated timeouts
- Dependency status reflects timeout issues

### Alerting Thresholds
- Configure monitoring to alert when timeout rates exceed 5% of requests
- Track timeout duration trends to identify performance degradation

## Error Handling

### Timeout Exceptions
- `RequestTimeoutException`: HTTP request timeout (middleware)
- Database timeouts: Logged as errors, may trigger circuit breaker
- External service timeouts: Logged with service-specific context

### Graceful Degradation
- Services with timeouts continue operating with degraded performance
- Circuit breakers prevent cascading failures
- Fallback mechanisms activate when primary services timeout

## Testing

### Timeout Testing
- Use network delay simulation tools to test timeout behavior
- Verify timeout exceptions are properly handled
- Test circuit breaker activation on timeout scenarios

### Load Testing
- Simulate high load to verify timeout configurations prevent resource exhaustion
- Monitor memory usage during timeout scenarios
- Validate that timeouts prevent thread pool blocking

## Best Practices

1. **Set conservative timeouts**: Start with longer timeouts and tune based on monitoring
2. **Monitor timeout rates**: Track and alert on increasing timeout frequencies
3. **Implement retries**: Use exponential backoff for retryable operations
4. **Circuit breakers**: Protect against cascading failures from timeouts
5. **Graceful degradation**: Design systems to function with partial service failures

## Troubleshooting

### Common Issues
- **High timeout rates**: Check network connectivity and service health
- **Memory leaks**: Verify timeout cleanup in async operations
- **Thread blocking**: Ensure timeouts are properly configured for all async operations

### Debugging
- Enable detailed logging for timeout events
- Use correlation IDs to trace timeout requests
- Monitor circuit breaker state and failure rates