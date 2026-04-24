# Integration Guide for Stablecoin Reserve Management System

This guide provides detailed instructions for integrating the Stablecoin Reserve Management System with your existing infrastructure.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Contract Deployment](#contract-deployment)
3. [Backend Integration](#backend-integration)
4. [Frontend Integration](#frontend-integration)
5. [Custodian Integration](#custodian-integration)
6. [Monitoring Integration](#monitoring-integration)
7. [Testing Integration](#testing-integration)

## Prerequisites

### Required Software

- **Rust 1.70+**: For building and testing the contract
- **Stellar CLI**: For deployment and interaction
- **Node.js 18+**: For backend integration examples
- **Docker**: For running supporting services

### Required Accounts

- **Stellar Account**: With sufficient XLM for deployment and operations
- **Custodian Accounts**: API access to Coinbase Custody, BitGo, etc.
- **Admin Accounts**: For governance operations

## Contract Deployment

### 1. Build Contract

```bash
cd contracts/stablecoin_reserve
cargo build --release --target wasm32-unknown-unknown
```

### 2. Deploy Contract

```bash
# Testnet deployment
./deploy.sh testnet

# Mainnet deployment
./deploy.sh mainnet
```

### 3. Initialize Contract

```bash
stellar contract invoke \
  --id $CONTRACT_ADDRESS \
  --source $ADMIN_ADDRESS \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --approvers '["'$APPROVER1'", "'$APPROVER2'", "'$APPROVER3'"]' \
  --executor "$EXECUTOR_ADDRESS" \
  --stablecoin "$STABLECOIN_ADDRESS"
```

## Backend Integration

### 1. Setup Dependencies

```javascript
// package.json
{
  "dependencies": {
    "@stellar/stellar-sdk": "^12.0.0",
    "axios": "^1.6.0",
    "crypto": "^1.0.1",
    "dotenv": "^16.3.0"
  }
}
```

### 2. Contract Client

```javascript
// src/contract/ReserveManager.js
const { Contract, SorobanRpc } = require('@stellar/stellar-sdk');
const axios = require('axios');

class ReserveManager {
  constructor(contractAddress, rpcUrl, networkPassphrase) {
    this.contract = new Contract(contractAddress);
    this.rpc = new SorobanRpc.Server(rpcUrl);
    this.networkPassphrase = networkPassphrase;
  }

  async addReserveAsset(adminKey, assetType, amount, custodian, verificationHash) {
    const account = await this.rpc.getAccount(adminKey.publicKey());
    
    const tx = new TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          "add_reserve_asset",
          ...this._prepareArgs(assetType, amount, custodian, verificationHash)
        )
      )
      .setTimeout(30)
      .build();

    tx.sign(adminKey);
    
    const result = await this.rpc.sendTransaction(tx);
    return await this._waitForTransaction(result.hash);
  }

  async generateProofOfReserves(adminKey) {
    const account = await this.rpc.getAccount(adminKey.publicKey());
    
    const tx = new TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call("generate_proof_of_reserves"))
      .setTimeout(30)
      .build();

    tx.sign(adminKey);
    
    const result = await this.rpc.sendTransaction(tx);
    return await this._waitForTransaction(result.hash);
  }

  async getReserveSnapshot() {
    const result = await this.rpc.simulateTransaction(
      new TransactionBuilder(new Account("G...", "1"), {
        fee: 100,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(this.contract.call("get_reserve_snapshot"))
        .build()
    );

    return this._parseResult(result);
  }

  _prepareArgs(assetType, amount, custodian, verificationHash) {
    // Convert arguments to Soroban format
    return [
      this._convertAssetType(assetType),
      this._convertAmount(amount),
      new Address(custodian),
      new xdr.ScBytes(verificationHash)
    ];
  }

  _convertAssetType(assetType) {
    const types = {
      'USD': 0,
      'Treasury': 1,
      'Repo': 2,
      'CorporateBond': 3,
      'ETF': 4
    };
    return new xdr.Int32(types[assetType]);
  }

  _convertAmount(amount) {
    return new xdr.Int128(amount.toString());
  }

  async _waitForTransaction(txHash) {
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      const result = await this.rpc.getTransaction(txHash);
      
      if (result.status === 'success') {
        return result;
      }
      
      if (result.status === 'failed') {
        throw new Error(`Transaction failed: ${result.resultXdr}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    throw new Error('Transaction timeout');
  }

  _parseResult(simulationResult) {
    if (simulationResult.status !== 'success') {
      throw new Error(`Simulation failed: ${simulationResult.error}`);
    }
    
    return this.contract.parseResult(simulationResult.result);
  }
}

module.exports = ReserveManager;
```

### 3. API Routes

```javascript
// src/routes/reserve.js
const express = require('express');
const ReserveManager = require('../contract/ReserveManager');
const router = express.Router();

const reserveManager = new ReserveManager(
  process.env.RESERVE_CONTRACT_ADDRESS,
  process.env.RPC_URL,
  process.env.NETWORK_PASSPHRASE
);

// Add reserve asset
router.post('/assets', async (req, res) => {
  try {
    const { assetType, amount, custodian, verificationHash } = req.body;
    const adminKey = Keypair.fromSecret(process.env.ADMIN_SECRET);
    
    const result = await reserveManager.addReserveAsset(
      adminKey,
      assetType,
      amount,
      custodian,
      verificationHash
    );
    
    res.json({ success: true, transactionHash: result.hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reserve snapshot
router.get('/snapshot', async (req, res) => {
  try {
    const snapshot = await reserveManager.getReserveSnapshot();
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate proof of reserves
router.post('/proof', async (req, res) => {
  try {
    const adminKey = Keypair.fromSecret(process.env.ADMIN_SECRET);
    const result = await reserveManager.generateProofOfReserves(adminKey);
    res.json({ success: true, merkleRoot: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify user inclusion
router.post('/verify', async (req, res) => {
  try {
    const { user, amount, proof, leafIndex } = req.body;
    const isValid = await reserveManager.verifyUserInclusion(user, amount, proof, leafIndex);
    res.json({ valid: isValid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

## Frontend Integration

### 1. React Component

```jsx
// src/components/ReserveDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Grid, Button, Alert } from '@mui/material';

const ReserveDashboard = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReserveSnapshot();
  }, []);

  const fetchReserveSnapshot = async () => {
    try {
      const response = await fetch('/api/reserve/snapshot');
      const data = await response.json();
      setSnapshot(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateProof = async () => {
    try {
      const response = await fetch('/api/reserve/proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      alert(`Proof generated: ${data.merkleRoot}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6">Total Reserves</Typography>
            <Typography variant="h4">
              ${(snapshot.total_reserves / 1e12).toLocaleString()}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6">Reserve Ratio</Typography>
            <Typography variant="h4" color={snapshot.reserve_ratio >= 10000 ? 'green' : 'red'}>
              {(snapshot.reserve_ratio / 100).toFixed(2)}%
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6">Asset Allocation</Typography>
            {snapshot.assets.map((asset, index) => (
              <Typography key={index}>
                {asset.asset_type}: ${(asset.amount / 1e12).toLocaleString()}
              </Typography>
            ))}
            <Button 
              variant="contained" 
              onClick={generateProof}
              style={{ marginTop: 16 }}
            >
              Generate Proof of Reserves
            </Button>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default ReserveDashboard;
```

### 2. WebSocket Integration

```javascript
// src/websocket/reserveUpdates.js
class ReserveUpdates {
  constructor() {
    this.ws = null;
    this.callbacks = [];
  }

  connect() {
    this.ws = new WebSocket(process.env.WS_URL);
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.callbacks.forEach(callback => callback(data));
    };
  }

  subscribe(callback) {
    this.callbacks.push(callback);
  }

  unsubscribe(callback) {
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }
}

export default new ReserveUpdates();
```

## Custodian Integration

### 1. Coinbase Custody Integration

```javascript
// src/custodians/CoinbaseCustody.js
const axios = require('axios');

class CoinbaseCustody {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.coinbasecustody.net';
  }

  async getBalance(currency) {
    try {
      const response = await axios.get(`${this.baseUrl}/v1/balances`, {
        headers: this._getHeaders(),
      });
      
      const balance = response.data.find(b => b.currency === currency);
      return balance ? parseFloat(balance.amount) : 0;
    } catch (error) {
      throw new Error(`Coinbase API error: ${error.message}`);
    }
  }

  async verifyHoldings() {
    try {
      const response = await axios.get(`${this.baseUrl}/v1/holdings`, {
        headers: this._getHeaders(),
      });
      
      return response.data.map(holding => ({
        currency: holding.currency,
        amount: parseFloat(holding.amount),
        verified: holding.verified,
      }));
    } catch (error) {
      throw new Error(`Verification failed: ${error.message}`);
    }
  }

  _getHeaders() {
    const timestamp = Date.now().toString();
    const signature = this._generateSignature(timestamp);
    
    return {
      'CB-ACCESS-KEY': this.apiKey,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
    };
  }

  _generateSignature(timestamp) {
    // Implement Coinbase signature generation
    const message = timestamp + 'GET' + '/v1/balances';
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('hex');
  }
}

module.exports = CoinbaseCustody;
```

### 2. BitGo Integration

```javascript
// src/custodians/BitGo.js
const BitGoJS = require('bitgo');

class BitGoCustody {
  constructor(accessToken, env = 'test') {
    this.bitgo = new BitGoJS.BitGo({ env, accessToken });
  }

  async getBalance(coin) {
    try {
      const wallets = await this.bitgo.coin(coin).wallets();
      const wallet = await wallets.get({ id: process.env.BITGO_WALLET_ID });
      const balance = await wallet.balance();
      return balance.balance;
    } catch (error) {
      throw new Error(`BitGo API error: ${error.message}`);
    }
  }

  async verifyHoldings() {
    try {
      const coins = ['eth', 'btc', 'usdc'];
      const holdings = [];
      
      for (const coin of coins) {
        const balance = await this.getBalance(coin);
        holdings.push({
          currency: coin.toUpperCase(),
          amount: balance,
          verified: true,
        });
      }
      
      return holdings;
    } catch (error) {
      throw new Error(`Verification failed: ${error.message}`);
    }
  }
}

module.exports = BitGoCustody;
```

## Monitoring Integration

### 1. Prometheus Metrics

```javascript
// src/monitoring/metrics.js
const client = require('prom-client');

// Create metrics
const reserveRatio = new client.Gauge({
  name: 'stablecoin_reserve_ratio',
  help: 'Current reserve ratio in basis points',
});

const totalReserves = new client.Gauge({
  name: 'stablecoin_total_reserves',
  help: 'Total reserves in smallest units',
});

const assetAllocation = new client.Gauge({
  name: 'stablecoin_asset_allocation',
  help: 'Asset allocation by type',
  labelNames: ['asset_type'],
});

const redemptionQueue = new client.Gauge({
  name: 'stablecoin_redemption_queue_size',
  help: 'Number of pending redemption requests',
});

module.exports = {
  reserveRatio,
  totalReserves,
  assetAllocation,
  redemptionQueue,
};
```

### 2. Alerting

```javascript
// src/monitoring/alerts.js
class AlertManager {
  constructor() {
    this.alerts = [];
  }

  checkReserveRatio(snapshot) {
    const ratio = snapshot.reserve_ratio / 100; // Convert to percentage
    
    if (ratio < 100) {
      this.sendAlert('CRITICAL', 'Reserve ratio below 100%', {
        current: ratio,
        threshold: 100,
      });
    } else if (ratio < 105) {
      this.sendAlert('WARNING', 'Reserve ratio approaching threshold', {
        current: ratio,
        threshold: 105,
      });
    }
  }

  checkCustodianSync(custodians) {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    custodians.forEach(custodian => {
      if (now - custodian.last_sync > maxAge) {
        this.sendAlert('WARNING', 'Custodian sync overdue', {
          custodian: custodian.name,
          last_sync: new Date(custodian.last_sync),
        });
      }
    });
  }

  sendAlert(level, message, data) {
    const alert = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    
    this.alerts.push(alert);
    
    // Send to external monitoring system
    this.sendToMonitoringSystem(alert);
  }

  sendToMonitoringSystem(alert) {
    // Integration with PagerDuty, Slack, etc.
    console.log('ALERT:', JSON.stringify(alert, null, 2));
  }
}

module.exports = AlertManager;
```

## Testing Integration

### 1. Contract Tests

```javascript
// test/contract/ReserveManager.test.js
const { StellarContract } = require('@stellar/stellar-sdk');
const ReserveManager = require('../../src/contract/ReserveManager');

describe('ReserveManager', () => {
  let reserveManager;
  let contractAddress;

  beforeAll(async () => {
    // Deploy test contract
    contractAddress = await deployTestContract();
    reserveManager = new ReserveManager(contractAddress, 'testnet');
  });

  test('should add reserve asset', async () => {
    const result = await reserveManager.addReserveAsset(
      adminKey,
      'USD',
      1000000,
      custodianAddress,
      verificationHash
    );
    
    expect(result.status).toBe('success');
  });

  test('should generate proof of reserves', async () => {
    const merkleRoot = await reserveManager.generateProofOfReserves(adminKey);
    expect(merkleRoot).toBeDefined();
  });

  test('should get reserve snapshot', async () => {
    const snapshot = await reserveManager.getReserveSnapshot();
    expect(snapshot.total_reserves).toBeGreaterThan(0);
  });
});
```

### 2. Integration Tests

```javascript
// test/integration/CustodianSync.test.js
const CoinbaseCustody = require('../../src/custodians/CoinbaseCustody');
const ReserveManager = require('../../src/contract/ReserveManager');

describe('Custodian Integration', () => {
  test('should sync with Coinbase Custody', async () => {
    const coinbase = new CoinbaseCustody(process.env.COINBASE_KEY, process.env.COINBASE_SECRET);
    const balance = await coinbase.getBalance('USDC');
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  test('should update contract with custodian data', async () => {
    const result = await reserveManager.syncWithCustodian(adminKey, custodianAddress);
    expect(result.status).toBe('success');
  });
});
```

## Environment Configuration

```bash
# .env
# Contract Configuration
RESERVE_CONTRACT_ADDRESS=GD...
RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Admin Configuration
ADMIN_SECRET=S...
ADMIN_PUBLIC=G...

# Custodian Configuration
COINBASE_API_KEY=your_coinbase_key
COINBASE_API_SECRET=your_coinbase_secret
BITGO_ACCESS_TOKEN=your_bitgo_token

# Monitoring
PROMETHEUS_PORT=9090
ALERT_WEBHOOK_URL=https://hooks.slack.com/...

# WebSocket
WS_URL=ws://localhost:8080
```

This integration guide provides comprehensive instructions for integrating the Stablecoin Reserve Management System with your existing infrastructure. The examples cover backend services, frontend applications, custodian integrations, and monitoring systems.
