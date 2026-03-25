#![cfg(test)]

use super::*;
use shared::governance::ProposalStatus;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    vec, Env, Vec,
};

// Use the auto-generated client from #[contractimpl]
use crate::UpgradeableTradingContractClient;

fn setup_contract(
    env: &Env,
) -> (
    UpgradeableTradingContractClient<'_>,
    Address,
    Address,
    Address,
) {
    let contract_id = env.register_contract(None, UpgradeableTradingContract);
    let client = UpgradeableTradingContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let approver = Address::generate(env);
    let executor = Address::generate(env);

    let mut approvers = Vec::new(env);
    approvers.push_back(approver.clone());

    env.mock_all_auths();
    client.init(&admin, &approvers, &executor);

    (client, admin, approver, executor)
}

#[test]
fn test_contract_initialization() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, UpgradeableTradingContract);
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let approver = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    client.init(&admin, &approvers, &executor);

    let version = client.get_version();
    assert_eq!(version, 1);
}

#[test]
fn test_contract_cannot_be_initialized_twice() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, UpgradeableTradingContract);
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let approver = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    // First initialization should succeed
    client.init(&admin, &approvers, &executor);

    // Second initialization should panic/fail
    let result = client.try_init(&admin, &approvers, &executor);
    assert!(result.is_err());
}

#[test]
fn test_upgrade_proposal_creation() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, _executor) = setup_contract(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let new_hash = symbol_short!("v2hash");
    let description = symbol_short!("Upgrade");
    let proposal_id =
        client.propose_upgrade(&admin, &new_hash, &description, &approvers, &1u32, &3600u64);

    assert_eq!(proposal_id, 1);

    let prop = client.get_upgrade_proposal(&1u64);
    assert_eq!(prop.id, 1);
    assert_eq!(prop.approvals_count, 0);
    assert_eq!(prop.status, ProposalStatus::Pending);
}

#[test]
fn test_upgrade_proposal_approval_flow() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, UpgradeableTradingContract);
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    client.init(&admin, &approvers, &executor);

    let new_hash = symbol_short!("v2hash");
    let description = symbol_short!("Upgrade");
    let proposal_id = client.propose_upgrade(
        &admin,
        &new_hash,
        &description,
        &approvers,
        &2u32, // Need 2 approvals
        &3600u64,
    );

    // First approval
    client.approve_upgrade(&proposal_id, &approver1);
    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.approvals_count, 1);
    assert_eq!(prop.status, ProposalStatus::Pending);

    // Second approval
    client.approve_upgrade(&proposal_id, &approver2);
    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.approvals_count, 2);
    assert_eq!(prop.status, ProposalStatus::Approved);
}

#[test]
fn test_upgrade_timelock_enforcement() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, executor) = setup_contract(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &1u32,
        &14400u64, // 4 hours
    );

    client.approve_upgrade(&proposal_id, &approver);

    // Try to execute immediately (should fail - timelock not expired)
    let execute_result = client.try_execute_upgrade(&proposal_id, &executor);
    assert!(execute_result.is_err());

    // Advance time past timelock
    env.ledger().with_mut(|li| li.timestamp = 1000 + 14401);

    // Now execution should succeed
    client.execute_upgrade(&proposal_id, &executor);

    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.status, ProposalStatus::Executed);
    assert!(prop.executed);
}

#[test]
fn test_upgrade_rejection_flow() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, _executor) = setup_contract(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &1u32,
        &3600u64,
    );

    client.reject_upgrade(&proposal_id, &approver);

    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.status, ProposalStatus::Rejected);
}

#[test]
fn test_upgrade_cancellation_by_admin() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, _executor) = setup_contract(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &1u32,
        &3600u64,
    );

    client.cancel_upgrade(&proposal_id, &admin);

    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.status, ProposalStatus::Cancelled);
}

#[test]
fn test_multi_sig_protection() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, UpgradeableTradingContract);
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let approver3 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());
    approvers.push_back(approver3.clone());

    client.init(&admin, &approvers, &executor);

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &2u32, // 2 of 3
        &3600u64,
    );

    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.approval_threshold, 2);

    client.approve_upgrade(&proposal_id, &approver1);
    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.approvals_count, 1);
    assert_eq!(prop.status, ProposalStatus::Pending);

    client.approve_upgrade(&proposal_id, &approver2);
    let prop = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(prop.approvals_count, 2);
    assert_eq!(prop.status, ProposalStatus::Approved);
}

#[test]
fn test_duplicate_approval_prevention() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, _executor) = setup_contract(&env);

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &vec![&env, approver.clone()],
        &1u32,
        &3600u64,
    );

    // First approval should succeed
    client.approve_upgrade(&proposal_id, &approver);

    // Second approval from same address should fail
    let result = client.try_approve_upgrade(&proposal_id, &approver);
    assert!(result.is_err());
}

// ============ OPTIMIZED TRADING TESTS ============

#[test]
fn test_optimized_trade_execution() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, _admin, _approver, _executor) = setup_contract(&env);

    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);

    // Register a mock token contract
    let token_id = env.register_stellar_asset_contract(fee_recipient.clone());

    // Execute a buy trade
    let trade_id = client.trade(
        &trader,
        &symbol_short!("BTCUSD"),
        &1_000_000i128,
        &50_000i128,
        &true,
        &token_id,
        &0i128, // Zero fee to avoid token transfer issues in test
        &fee_recipient,
    );

    assert_eq!(trade_id, 1);

    // Verify stats updated correctly
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 1);
    assert_eq!(stats.total_volume, 1_000_000);
}

#[test]
fn test_optimized_trade_signed_amount() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, _admin, _approver, _executor) = setup_contract(&env);

    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(fee_recipient.clone());

    // Execute buy trade (positive amount)
    let buy_id = client.trade(
        &trader,
        &symbol_short!("BTCUSD"),
        &1_000_000i128,
        &50_000i128,
        &true,
        &token_id,
        &0i128,
        &fee_recipient,
    );

    // Execute sell trade (negative amount internally)
    let sell_id = client.trade(
        &trader,
        &symbol_short!("BTCUSD"),
        &500_000i128,
        &49_000i128,
        &false,
        &token_id,
        &0i128,
        &fee_recipient,
    );

    assert_eq!(buy_id, 1);
    assert_eq!(sell_id, 2);

    // Verify both trades recorded
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 2);
    assert_eq!(stats.total_volume, 1_500_000);
}

#[test]
fn test_optimized_get_trade() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, _admin, _approver, _executor) = setup_contract(&env);

    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(fee_recipient.clone());

    // Execute trade
    let trade_id = client.trade(
        &trader,
        &symbol_short!("BTCUSD"),
        &1_000_000i128,
        &50_000i128,
        &true,
        &token_id,
        &0i128,
        &fee_recipient,
    );

    // Get specific trade by ID
    let trade = client.get_trade(&trade_id);
    assert!(trade.is_some());

    let trade = trade.unwrap();
    assert_eq!(trade.id, 1);
    assert_eq!(trade.signed_amount, 1_000_000); // Positive = buy
    assert_eq!(trade.price, 50_000);
}

#[test]
fn test_optimized_get_recent_trades() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, _admin, _approver, _executor) = setup_contract(&env);

    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(fee_recipient.clone());

    // Execute multiple trades
    for i in 1..=5 {
        client.trade(
            &trader,
            &symbol_short!("BTCUSD"),
            &(i as i128 * 100_000),
            &50_000i128,
            &true,
            &token_id,
            &0i128,
            &fee_recipient,
        );
    }

    // Get recent trades
    let recent = client.get_recent_trades(&3u32);
    assert_eq!(recent.len(), 3);

    // Should get trades 3, 4, 5
    assert_eq!(recent.get(0).unwrap().id, 3);
    assert_eq!(recent.get(1).unwrap().id, 4);
    assert_eq!(recent.get(2).unwrap().id, 5);
}

#[test]
fn test_optimized_pause_unpause() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, _approver, _executor) = setup_contract(&env);

    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(fee_recipient.clone());

    // Pause contract
    client.pause(&admin);

    // Try to trade (should fail)
    let result = client.try_trade(
        &trader,
        &symbol_short!("BTCUSD"),
        &1_000_000i128,
        &50_000i128,
        &true,
        &token_id,
        &0i128,
        &fee_recipient,
    );
    assert!(result.is_err());

    // Unpause
    client.unpause(&admin);

    // Trade should work now
    let trade_id = client.trade(
        &trader,
        &symbol_short!("BTCUSD"),
        &1_000_000i128,
        &50_000i128,
        &true,
        &token_id,
        &0i128,
        &fee_recipient,
    );
    assert_eq!(trade_id, 1);
}

#[test]
fn test_optimized_storage_scaling() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, _admin, _approver, _executor) = setup_contract(&env);

    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(fee_recipient.clone());

    // Execute many trades to test storage scaling
    for i in 1..=20 {
        let trade_id = client.trade(
            &trader,
            &symbol_short!("BTCUSD"),
            &(i as i128 * 100_000),
            &50_000i128,
            &(i % 2 == 0), // Alternate buy/sell
            &token_id,
            &0i128,
            &fee_recipient,
        );
        assert_eq!(trade_id, i as u64);
    }

    // Verify stats
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 20);

    // Verify individual trade access still works
    let trade_10 = client.get_trade(&10u64);
    assert!(trade_10.is_some());
    assert_eq!(trade_10.unwrap().id, 10);
}
