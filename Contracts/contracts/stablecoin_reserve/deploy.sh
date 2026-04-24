#!/bin/bash

# Stablecoin Reserve Management System Deployment Script
# This script deploys and initializes the stablecoin reserve management contract

set -e

# Configuration
NETWORK=${1:-"testnet"}
CONTRACT_NAME="stablecoin_reserve"
WASM_FILE="target/wasm32-unknown-unknown/release/${CONTRACT_NAME}.wasm"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying Stablecoin Reserve Management System${NC}"
echo -e "${YELLOW}Network: ${NETWORK}${NC}"

# Check if WASM file exists
if [ ! -f "$WASM_FILE" ]; then
    echo -e "${RED}❌ WASM file not found: $WASM_FILE${NC}"
    echo -e "${YELLOW}Please run: cargo build --release --target wasm32-unknown-unknown${NC}"
    exit 1
fi

# Build contract if not already built
echo -e "${YELLOW}🔨 Building contract...${NC}"
cargo build --release --target wasm32-unknown-unknown

# Set network configuration
case $NETWORK in
    "testnet")
        stellar config network set testnet https://soroban-testnet.stellar.org
        stellar config set --scope global RPC_URL "https://soroban-testnet.stellar.org"
        stellar config set --scope global NETWORK_PASSPHRASE "Test SDF Network ; September 2015"
        ;;
    "mainnet")
        stellar config network set mainnet https://horizon.stellar.org
        stellar config set --scope global RPC_URL "https://mainnet.stellar.validationcloud.io/v1"
        stellar config set --scope global NETWORK_PASSPHRASE "Public Global Stellar Network ; September 2015"
        ;;
    *)
        echo -e "${RED}❌ Unsupported network: $NETWORK${NC}"
        echo "Supported networks: testnet, mainnet"
        exit 1
        ;;
esac

# Check if source account is configured
if ! stellar keys address; then
    echo -e "${RED}❌ No source account configured${NC}"
    echo "Please run: stellar keys add <account_name>"
    exit 1
fi

SOURCE_ACCOUNT=$(stellar keys address)
echo -e "${GREEN}📋 Source account: $SOURCE_ACCOUNT${NC}"

# Deploy contract
echo -e "${YELLOW}📦 Deploying contract...${NC}"
CONTRACT_ADDRESS=$(stellar contract deploy \
    --wasm $WASM_FILE \
    --source $SOURCE_ACCOUNT \
    --network $NETWORK)

echo -e "${GREEN}✅ Contract deployed at: $CONTRACT_ADDRESS${NC}"

# Initialize contract with default parameters
echo -e "${YELLOW}⚙️ Initializing contract...${NC}"

# Generate admin, approver, and executor addresses
ADMIN_ADDRESS=$SOURCE_ACCOUNT
APPROVER1_ADDRESS=$(stellar keys generate --seed | grep "Public Key:" | cut -d' ' -f3)
APPROVER2_ADDRESS=$(stellar keys generate --seed | grep "Public Key:" | cut -d' ' -f3)
APPROVER3_ADDRESS=$(stellar keys generate --seed | grep "Public Key:" | cut -d' ' -f3)
EXECUTOR_ADDRESS=$(stellar keys generate --seed | grep "Public Key:" | cut -d' ' -f3)

# For demo purposes, use the same account for all roles
APPROVER1_ADDRESS=$ADMIN_ADDRESS
APPROVER2_ADDRESS=$ADMIN_ADDRESS
APPROVER3_ADDRESS=$ADMIN_ADDRESS
EXECUTOR_ADDRESS=$ADMIN_ADDRESS

# Create a mock stablecoin address for initialization
STABLECOIN_ADDRESS=$(stellar keys generate --seed | grep "Public Key:" | cut -d' ' -f3)
STABLECOIN_ADDRESS=$ADMIN_ADDRESS

# Initialize contract
stellar contract invoke \
    --id $CONTRACT_ADDRESS \
    --source $ADMIN_ADDRESS \
    --network $NETWORK \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --approvers '["'$APPROVER1_ADDRESS'", "'$APPROVER2_ADDRESS'", "'$APPROVER3_ADDRESS'"]' \
    --executor "$EXECUTOR_ADDRESS" \
    --stablecoin "$STABLECOIN_ADDRESS"

echo -e "${GREEN}✅ Contract initialized successfully${NC}"

# Save deployment information
DEPLOYMENT_INFO="{
    \"network\": \"$NETWORK\",
    \"contract_address\": \"$CONTRACT_ADDRESS\",
    \"admin_address\": \"$ADMIN_ADDRESS\",
    \"approvers\": [\"$APPROVER1_ADDRESS\", \"$APPROVER2_ADDRESS\", \"$APPROVER3_ADDRESS\"],
    \"executor_address\": \"$EXECUTOR_ADDRESS\",
    \"stablecoin_address\": \"$STABLECOIN_ADDRESS\",
    \"deployment_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}"

echo "$DEPLOYMENT_INFO" > deployment_info_$NETWORK.json
echo -e "${GREEN}📄 Deployment info saved to deployment_info_$NETWORK.json${NC}"

# Display deployment summary
echo -e "${GREEN}🎉 Deployment Summary${NC}"
echo "=================================="
echo "Network: $NETWORK"
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Admin Address: $ADMIN_ADDRESS"
echo "Executor Address: $EXECUTOR_ADDRESS"
echo "Stablecoin Address: $STABLECOIN_ADDRESS"
echo "Deployment Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=================================="

# Next steps
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Register custodians using register_custodian function"
echo "2. Add reserve assets using add_reserve_asset function"
echo "3. Configure target allocations using update_target_allocation function"
echo "4. Set up regular proof of reserves generation"
echo "5. Configure redemption parameters"
echo ""
echo -e "${GREEN}🚀 Stablecoin Reserve Management System is ready!${NC}"
