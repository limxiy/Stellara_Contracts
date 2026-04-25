# Contract ABI Registry

This document describes the contract ABI registry system that enables proper event parsing and validation for Stellar smart contracts.

## Overview

The contract ABI registry provides a comprehensive system for managing contract ABIs (Application Binary Interfaces) and event schemas. It enables:

- **ABI Management**: Store and version contract ABIs
- **Event Parsing**: Parse events using proper ABI definitions
- **Event Validation**: Validate events against contract schemas
- **Version Control**: Manage multiple ABI versions per contract
- **Registry Management**: Complete contract lifecycle management

## Database Schema

The system introduces three new tables:

### ContractRegistry
Stores contract metadata and basic information.

```sql
CREATE TABLE "contract_registry" (
    "id" TEXT PRIMARY KEY,
    "contract_id" TEXT UNIQUE NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT DEFAULT '1.0.0',
    "network" TEXT NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "verified" BOOLEAN DEFAULT false,
    "description" TEXT,
    "source_code_url" TEXT,
    "documentation_url" TEXT,
    "deployed_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### ContractAbi
Stores ABI definitions with versioning support.

```sql
CREATE TABLE "contract_abis" (
    "id" TEXT PRIMARY KEY,
    "contract_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "abi_json" JSONB NOT NULL,
    "abi_hash" TEXT NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "is_latest" BOOLEAN DEFAULT false,
    "deployed_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("contract_id") REFERENCES "contract_registry"("contract_id")
);
```

### ContractEvent
Stores individual event schemas from ABIs.

```sql
CREATE TABLE "contract_events" (
    "id" TEXT PRIMARY KEY,
    "abi_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "event_topic" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("abi_id") REFERENCES "contract_abis"("id"),
    FOREIGN KEY ("contract_id") REFERENCES "contract_registry"("contract_id")
);
```

## API Endpoints

### Contract Registration
```
POST /indexer/contracts/register
```

Register a new contract with its ABI definition.

**Request Body:**
```json
{
  "contractId": "CDLZFC3SYJYD5T5Z3W57CN2UYAF6LW5PGQ3STCTXYSY7MP2P3KU4A",
  "name": "Project Launch Contract",
  "version": "1.0.0",
  "network": "testnet",
  "description": "Contract for launching crowdfunding projects",
  "sourceCodeUrl": "https://github.com/example/project-launch",
  "documentationUrl": "https://docs.example.com/project-launch",
  "abi": {
    "name": "ProjectLaunch",
    "version": "1.0.0",
    "networks": {
      "testnet": "CDLZFC3SYJYD5T5Z3W57CN2UYAF6LW5PGQ3STCTXYSY7MP2P3KU4A"
    },
    "events": [
      {
        "name": "PROJECT_CREATED",
        "topic": "proj_new",
        "signature": "proj_new(address,uint256,uint256)",
        "inputs": [
          {
            "name": "creator",
            "type": "address",
            "indexed": true,
            "description": "Address of the project creator"
          },
          {
            "name": "fundingGoal",
            "type": "uint256",
            "description": "Funding goal in smallest token unit"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "description": "Project deadline timestamp"
          }
        ],
        "description": "Emitted when a new project is created"
      }
    ]
  }
}
```

### Get Contract Details
```
GET /indexer/contracts/{contractId}
```

Retrieve contract information including ABI versions and events.

### Get Latest ABI
```
GET /indexer/contracts/{contractId}/abi/latest
```

Get the latest active ABI for a contract.

### Get Specific ABI Version
```
GET /indexer/contracts/{contractId}/abi/{version}
```

Get a specific version of a contract's ABI.

### Update Contract ABI
```
PUT /indexer/contracts/{contractId}/abi
```

Update a contract's ABI with a new version.

**Request Body:**
```json
{
  "version": "1.1.0",
  "deprecatePrevious": true,
  "abi": {
    "name": "ProjectLaunch",
    "version": "1.1.0",
    "events": [
      // Updated event definitions
    ]
  }
}
```

### Search Contracts
```
GET /indexer/contracts/search?network=testnet&verified=true&active=true
```

Search contracts with various filters.

**Query Parameters:**
- `network`: Filter by network (testnet, mainnet)
- `verified`: Filter by verification status
- `active`: Filter by active status
- `name`: Search by name (contains)
- `hasAbi`: Filter by ABI presence

### Validate Event
```
POST /indexer/contracts/{contractId}/validate-event
```

Validate event data against contract ABI.

**Request Body:**
```json
{
  "eventTopic": "proj_new",
  "eventData": {
    "creator": "GD5DQ...",
    "fundingGoal": "1000000000",
    "deadline": "1640995200"
  }
}
```

### Registry Statistics
```
GET /indexer/contracts/stats
```

Get comprehensive statistics about the contract registry.

## ABI Definition Format

The ABI follows a standardized format for Stellar contracts:

```json
{
  "name": "ContractName",
  "version": "1.0.0",
  "networks": {
    "testnet": "CONTRACT_ID",
    "mainnet": "CONTRACT_ID"
  },
  "events": [
    {
      "name": "EVENT_NAME",
      "topic": "event_topic",
      "signature": "event_topic(type1,type2)",
      "inputs": [
        {
          "name": "parameter_name",
          "type": "parameter_type",
          "indexed": false,
          "description": "Parameter description"
        }
      ],
      "description": "Event description"
    }
  ],
  "functions": [
    {
      "name": "function_name",
      "inputs": [
        {
          "name": "parameter_name",
          "type": "parameter_type"
        }
      ],
      "outputs": [
        {
          "name": "return_name",
          "type": "return_type"
        }
      ],
      "description": "Function description"
    }
  ]
}
```

### Supported Types

- `address`: Stellar address
- `uint256`, `uint128`, `uint64`: Unsigned integers
- `int256`, `int128`, `int64`: Signed integers
- `string`: Text strings
- `boolean`: Boolean values
- `bytes`: Byte arrays
- `symbol`: Stellar symbols

## Event Parsing Integration

The ABI parser integrates seamlessly with the indexer:

### Enhanced Event Parsing
```typescript
// Before: Basic parsing
const parsedEvent = this.parseEvent(event);

// After: ABI-enhanced parsing
const parsedEvent = await this.abiParserService.parseEventWithAbi(event);
```

### Event Validation
```typescript
// Validate event against ABI
const validation = await this.abiParserService.validateEventWithAbi(event);

if (!validation.isValid) {
  this.logger.warn(`Event validation failed: ${validation.errors.join(', ')}`);
  return false;
}
```

### ABI Caching
The system implements intelligent caching:

- **Memory Cache**: ABIs cached in memory for fast access
- **Cache Expiry**: 5-minute cache expiry to ensure freshness
- **Cache Invalidation**: Manual cache clearing when ABIs are updated

## ABI Versioning

The system supports full ABI versioning:

### Version Management
- **Semantic Versioning**: Use semantic versioning (1.0.0, 1.1.0, 2.0.0)
- **Latest Flag**: Automatically marks newest version as latest
- **Deprecation**: Option to deprecate previous versions
- **Rollback**: Keep all versions for potential rollback

### Version Lifecycle
1. **Initial Registration**: v1.0.0 registered as latest
2. **Update**: v1.1.0 registered, v1.0.0 marked as not latest
3. **Deprecation**: Optional deprecation of old versions
4. **Major Update**: v2.0.0 for breaking changes

## Event Validation

The system provides comprehensive event validation:

### Validation Checks
- **Topic Matching**: Event topic matches ABI definition
- **Parameter Count**: Required parameters are present
- **Type Validation**: Parameter types match expected types
- **Signature Validation**: Event signature matches

### Validation Results
```typescript
interface EventValidationResult {
  isValid: boolean;
  eventName?: string;
  parsedData?: Record<string, unknown>;
  errors?: string[];
  warnings?: string[];
}
```

## Usage Examples

### Register a New Contract
```bash
curl -X POST http://localhost:3000/indexer/contracts/register \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d @contract-registration.json
```

### Get Contract ABI
```bash
curl -X GET http://localhost:3000/indexer/contracts/CONTRACT_ID/abi/latest \
  -H "Authorization: Bearer <token>"
```

### Validate Event
```bash
curl -X POST http://localhost:3000/indexer/contracts/CONTRACT_ID/validate-event \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventTopic": "proj_new",
    "eventData": {
      "creator": "GD5DQ...",
      "fundingGoal": "1000000000"
    }
  }'
```

### Search Contracts
```bash
curl -X GET "http://localhost:3000/indexer/contracts/search?network=testnet&verified=true" \
  -H "Authorization: Bearer <token>"
```

## Integration with Event Handlers

The ABI registry integrates with existing event handlers:

### Enhanced Event Processing
```typescript
async processEvent(event: SorobanEvent): Promise<boolean> {
  // Parse with ABI
  const parsedEvent = await this.abiParserService.parseEventWithAbi(event);
  if (!parsedEvent) return false;

  // Validate with ABI
  const validation = await this.abiParserService.validateEventWithAbi(event);
  if (!validation.isValid) {
    this.logger.warn(`Invalid event: ${validation.errors.join(', ')}`);
    return false;
  }

  // Process with enhanced data
  return await this.eventHandler.processEvent(parsedEvent);
}
```

### Type Safety
The ABI system provides enhanced type safety:

- **Typed Event Data**: Events parsed with correct types
- **Schema Validation**: Events validated against schemas
- **Error Prevention**: Type mismatches caught early

## Performance Considerations

### Caching Strategy
- **ABI Caching**: ABIs cached in memory for 5 minutes
- **Event Schema Caching**: Event schemas cached with ABIs
- **Cache Warming**: Frequently used ABIs pre-loaded

### Database Optimization
- **Indexes**: Optimized indexes for common queries
- **Relations**: Efficient relation loading
- **Pagination**: Large result sets paginated

### Memory Management
- **Cache Size Limits**: Prevent memory bloat
- **Cache Cleanup**: Automatic cleanup of expired entries
- **Memory Monitoring**: Track cache memory usage

## Security Considerations

### ABI Validation
- **Schema Validation**: ABIs validated before storage
- **Hash Verification**: ABI integrity verified with hashes
- **Input Sanitization**: All inputs sanitized

### Access Control
- **Authentication**: All endpoints require JWT authentication
- **Authorization**: Role-based access for sensitive operations
- **Audit Trail**: All changes logged for audit

### Data Protection
- **Sensitive Data**: No sensitive data stored in ABIs
- **Encryption**: Optional encryption for sensitive ABIs
- **Privacy**: Contract information privacy respected

## Monitoring and Metrics

### Registry Metrics
- **Contract Count**: Total registered contracts
- **ABI Versions**: Number of ABI versions
- **Event Types**: Supported event types
- **Validation Rate**: Event validation success rate

### Performance Metrics
- **Parse Time**: Event parsing duration
- **Cache Hit Rate**: ABI cache effectiveness
- **Database Query Time**: Query performance
- **Memory Usage**: Cache memory consumption

### Error Metrics
- **Validation Failures**: Event validation errors
- **Parse Failures**: Event parsing errors
- **ABI Errors**: ABI-related errors
- **Database Errors**: Database operation errors

## Troubleshooting

### Common Issues

#### Event Parsing Fails
1. Check if ABI is registered for the contract
2. Verify event topic matches ABI definition
3. Validate event data structure
4. Check ABI version compatibility

#### ABI Registration Fails
1. Validate ABI structure and format
2. Check required fields are present
3. Verify event definitions are correct
4. Ensure network is supported

#### Performance Issues
1. Check cache hit rates
2. Monitor database query performance
3. Verify indexes are being used
4. Check for memory leaks

### Debug Tools

#### Cache Statistics
```typescript
const stats = abiParserService.getCacheStats();
console.log('Cache stats:', stats);
```

#### Validation Debugging
```typescript
const validation = await abiParserService.validateEventWithAbi(event);
console.log('Validation result:', validation);
```

#### ABI Inspection
```typescript
const abi = await contractRegistryService.getLatestAbi(contractId);
console.log('ABI structure:', abi);
```

## Best Practices

### ABI Management
1. **Version Control**: Use semantic versioning
2. **Documentation**: Document all event types
3. **Testing**: Test ABIs before registration
4. **Validation**: Validate ABIs thoroughly

### Event Handling
1. **Type Safety**: Use typed event data
2. **Validation**: Always validate events
3. **Error Handling**: Handle validation failures gracefully
4. **Logging**: Log parsing and validation issues

### Performance
1. **Caching**: Leverage ABI caching effectively
2. **Batching**: Batch operations when possible
3. **Monitoring**: Monitor performance metrics
4. **Optimization**: Optimize frequently used queries

### Security
1. **Validation**: Validate all inputs
2. **Authentication**: Secure all endpoints
3. **Authorization**: Implement proper access control
4. **Auditing**: Log all important operations

## Migration Guide

### From Basic Event Parsing
1. Register existing contracts with ABIs
2. Update event parsing to use ABI parser
3. Add event validation
4. Monitor for parsing issues

### ABI Registration
1. Extract ABI definitions from contracts
2. Format ABIs according to schema
3. Register contracts with ABIs
4. Test event parsing and validation

### Integration Steps
1. Deploy database migration
2. Update indexer service
3. Register contract ABIs
4. Test event processing
5. Monitor performance

## Future Enhancements

### Planned Features
- **Automatic ABI Discovery**: Auto-discover ABIs from contracts
- **ABI Generation**: Generate ABIs from contract source
- **Enhanced Validation**: More sophisticated validation rules
- **Performance Optimization**: Further performance improvements

### Extension Points
- **Custom Parsers**: Custom event parsing logic
- **Validation Rules**: Custom validation rules
- **Event Handlers**: Custom event handling
- **Storage Backends**: Alternative storage options

This comprehensive ABI registry system provides a solid foundation for proper event parsing and validation in the Stellar indexer, enabling robust and scalable contract event processing.
