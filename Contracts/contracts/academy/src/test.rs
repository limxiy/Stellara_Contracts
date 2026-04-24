#![cfg(test)]

use crate::vesting::{AcademyVestingContract, AcademyVestingContractClient};
use shared::circuit_breaker::CircuitBreakerConfig;
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

fn create_token(
    env: &Env,
    admin: &Address,
) -> (Address, TokenClient<'static>, StellarAssetClient<'static>) {
    let token_id = env.register_stellar_asset_contract(admin.clone());
    (
        token_id.clone(),
        TokenClient::new(env, &token_id),
        StellarAssetClient::new(env, &token_id),
    )
}

fn default_cb_config() -> CircuitBreakerConfig {
    CircuitBreakerConfig {
        max_volume_per_period: 1_000_000_000i128,
        max_tx_count_per_period: 100u64,
        period_duration: 3600u64,
    }
}

fn setup_contract(
    env: &Env,
) -> (
    AcademyVestingContractClient<'_>,
    Address,
    Address,
    Address,
    Address,
    TokenClient<'static>,
    StellarAssetClient<'static>,
) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let governance = Address::generate(env);
    let beneficiary = Address::generate(env);
    let other = Address::generate(env);
    let (reward_token, token, token_admin) = create_token(env, &admin);

    let contract_id = env.register_contract(None, AcademyVestingContract);
    let client = AcademyVestingContractClient::new(env, &contract_id);
    let cb_config = default_cb_config();
    client.init(&admin, &reward_token, &governance, &cb_config);

    (
        client,
        admin,
        governance,
        beneficiary,
        other,
        token,
        token_admin,
    )
}

#[test]
fn test_contract_initialization() {
    let env = Env::default();
    let (client, admin, governance, _beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);

    let (stored_admin, stored_token, stored_governance) = client.get_info();
    assert_eq!(stored_admin, admin);
    assert_eq!(stored_governance, governance);
    assert!(stored_token != admin);
}

#[test]
fn test_contract_cannot_be_initialized_twice() {
    let env = Env::default();
    let (client, admin, governance, _beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);
    let replacement_token = Address::generate(&env);

    let cb_config = default_cb_config();
    let result = client.try_init(&admin, &replacement_token, &governance, &cb_config);
    assert!(result.is_err());
}

#[test]
fn test_grant_vesting_schedule() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);

    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &100, &60, &3600);
    assert_eq!(grant_id, 1);

    let schedule = client.get_vesting(&grant_id);
    assert_eq!(schedule.beneficiary, beneficiary);
    assert_eq!(schedule.amount, 1000);
    assert_eq!(schedule.start_time, 100);
    assert_eq!(schedule.cliff, 60);
    assert_eq!(schedule.duration, 3600);
    assert!(!schedule.claimed);
    assert!(!schedule.revoked);
}

#[test]
fn test_non_admin_cannot_grant() {
    let env = Env::default();
    let (client, _admin, _governance, beneficiary, other, _token, _token_admin) =
        setup_contract(&env);

    let result = client.try_grant_vesting(&other, &beneficiary, &1000, &0, &0, &10);
    assert!(result.is_err());
}

#[test]
fn test_vesting_calculation_partial_and_full() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);

    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000);

    env.ledger().with_mut(|li| li.timestamp = 550);
    let partial = client.get_vested_amount(&grant_id);
    assert!(partial >= 490 && partial <= 510);

    env.ledger().with_mut(|li| li.timestamp = 1001);
    let full = client.get_vested_amount(&grant_id);
    assert_eq!(full, 1000);
}

#[test]
fn test_claim_not_vested() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);

    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &1000, &300, &3600);
    env.ledger().with_mut(|li| li.timestamp = 900);

    let result = client.try_claim(&grant_id, &beneficiary);
    assert!(result.is_err());
}

#[test]
fn test_claim_single_semantics_prevents_double_claim() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, token, token_admin) =
        setup_contract(&env);

    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &0, &10);
    env.ledger().with_mut(|li| li.timestamp = 20);
    token_admin.mint(&client.address, &1000);

    let claimed = client.claim(&grant_id, &beneficiary);
    assert_eq!(claimed, 1000);
    assert_eq!(token.balance(&beneficiary), 1000);

    let result = client.try_claim(&grant_id, &beneficiary);
    assert!(result.is_err());
}

#[test]
fn test_claim_wrong_beneficiary() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, other, _token, token_admin) =
        setup_contract(&env);

    let grant_id = client.grant_vesting(&admin, &beneficiary, &500, &0, &0, &10);
    env.ledger().with_mut(|li| li.timestamp = 20);
    token_admin.mint(&client.address, &500);

    let result = client.try_claim(&grant_id, &other);
    assert!(result.is_err());
}

#[test]
fn test_batch_claim_claims_multiple_rewards_atomically() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, token, token_admin) =
        setup_contract(&env);

    let grant_one = client.grant_vesting(&admin, &beneficiary, &600, &0, &0, &10);
    let grant_two = client.grant_vesting(&admin, &beneficiary, &900, &0, &0, &10);

    env.ledger().with_mut(|li| li.timestamp = 20);
    token_admin.mint(&client.address, &1500);

    let claimed = client.batch_claim(&soroban_sdk::vec![&env, grant_one, grant_two], &beneficiary);
    assert_eq!(claimed, 1500);
    assert_eq!(token.balance(&beneficiary), 1500);
    assert!(client.get_vesting(&grant_one).claimed);
    assert!(client.get_vesting(&grant_two).claimed);
}

#[test]
fn test_batch_claim_is_all_or_nothing() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, token, token_admin) =
        setup_contract(&env);

    let vested_grant = client.grant_vesting(&admin, &beneficiary, &400, &0, &0, &10);
    let unvested_grant = client.grant_vesting(&admin, &beneficiary, &800, &100, &50, &200);

    env.ledger().with_mut(|li| li.timestamp = 20);
    token_admin.mint(&client.address, &1200);

    let result = client.try_batch_claim(
        &soroban_sdk::vec![&env, vested_grant, unvested_grant],
        &beneficiary,
    );
    assert!(result.is_err());
    assert_eq!(token.balance(&beneficiary), 0);
    assert!(!client.get_vesting(&vested_grant).claimed);
    assert!(!client.get_vesting(&unvested_grant).claimed);
}

#[test]
fn test_batch_claim_rejects_oversized_batch() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);

    let mut grant_ids = soroban_sdk::Vec::new(&env);
    for _ in 0..client.max_batch_claims() + 1 {
        let grant_id = client.grant_vesting(&admin, &beneficiary, &10, &0, &0, &1);
        grant_ids.push_back(grant_id);
    }

    let result = client.try_batch_claim(&grant_ids, &beneficiary);
    assert!(result.is_err());
}

#[test]
fn test_revoke_blocks_future_claims() {
    let env = Env::default();
    let (client, admin, _governance, beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);

    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &3600);
    env.ledger().with_mut(|li| li.timestamp = 3600);
    client.revoke(&grant_id, &admin, &3600);

    let result = client.try_claim(&grant_id, &beneficiary);
    assert!(result.is_err());
}

#[test]
fn test_max_batch_claims_constant() {
    let env = Env::default();
    let (client, _admin, _governance, _beneficiary, _other, _token, _token_admin) =
        setup_contract(&env);

    assert_eq!(client.max_batch_claims(), 25);
}
