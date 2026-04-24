//! Integration tests for the Parametric Insurance Protocol
//!
//! These tests exercise the full contract lifecycle end-to-end:
//!   - Initialization
//!   - Liquidity pool management
//!   - Policy creation
//!   - Oracle trigger verification and automatic payout
//!   - Policy expiry
//!   - Edge cases and error paths

#![cfg(test)]

use parametric_insurance::{
    Error as InsuranceError,
    InsurancePolicyType as PolicyType,
    InsuranceTriggerCondition as TriggerCondition,
    ParametricInsuranceContract,
    ParametricInsuranceContractClient,
    Status as PolicyStatus,
};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, Env, Symbol, Vec,
};

// =============================================================================
// Mock oracle contract
// =============================================================================

/// Stores and serves (value, timestamp) pairs per oracle feed symbol.
#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    pub fn set_price(env: Env, feed: Symbol, value: i128, ts: u64) {
        env.storage().instance().set(&feed, &(value, ts));
    }

    pub fn get_price(env: Env, feed: Symbol) -> (i128, u64) {
        env.storage()
            .instance()
            .get(&feed)
            .unwrap_or((0i128, 0u64))
    }
}

// =============================================================================
// Helpers
// =============================================================================

fn create_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract(admin.clone())
}

fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token).mint(to, &amount);
}

fn balance(env: &Env, token: &Address, of: &Address) -> i128 {
    token::Client::new(env, token).balance(of)
}

fn advance_time(env: &Env, secs: u64) {
    let ts = env.ledger().timestamp() + secs;
    env.ledger().set(LedgerInfo {
        timestamp: ts,
        protocol_version: env.ledger().protocol_version(),
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: u32::MAX,
    });
}

struct Ctx {
    env: Env,
    contract: Address,
    pool_token: Address,
    admin: Address,
    lp: Address,
    alice: Address,   // policyholder
    oracle: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let lp = Address::generate(&env);
    let alice = Address::generate(&env);

    let pool_token = create_token(&env, &admin);
    mint(&env, &pool_token, &lp, 1_000_000);
    mint(&env, &pool_token, &alice, 50_000);

    let oracle = env.register_contract(None, MockOracle);
    let contract = env.register_contract(None, ParametricInsuranceContract);

    let mut sources = Vec::new(&env);
    sources.push_back(oracle.clone());

    ParametricInsuranceContractClient::new(&env, &contract)
        .init(&admin, &pool_token, &sources, &3600u64, &1u32)
        .unwrap();

    Ctx { env, contract, pool_token, admin, lp, alice, oracle }
}

// =============================================================================
// Initialization tests
// =============================================================================

#[test]
fn init_sets_correct_state() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    assert!(c.is_initialized());
    assert!(!c.is_paused());
    assert_eq!(c.get_policy_count(), 0);

    let pool = c.get_pool_stats();
    assert_eq!(pool.total_liquidity, 0);
    assert_eq!(pool.active_policies, 0);
}

#[test]
fn double_init_is_rejected() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);
    let mut sources = Vec::new(&ctx.env);
    sources.push_back(ctx.oracle.clone());

    assert!(c
        .try_init(&ctx.admin, &ctx.pool_token, &sources, &0u64, &1u32)
        .is_err());
}

// =============================================================================
// Pause / unpause tests
// =============================================================================

#[test]
fn pause_blocks_deposits() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.pause(&ctx.admin).unwrap();
    assert!(c.try_deposit_liquidity(&ctx.lp, &1000i128).is_err());

    c.unpause(&ctx.admin).unwrap();
    c.deposit_liquidity(&ctx.lp, &1000i128).unwrap();
    assert_eq!(c.get_pool_stats().total_liquidity, 1000);
}

#[test]
fn non_admin_cannot_pause() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);
    assert!(c.try_pause(&ctx.lp).is_err());
}

// =============================================================================
// Liquidity pool tests
// =============================================================================

#[test]
fn deposit_and_full_withdrawal() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &200_000i128).unwrap();
    assert_eq!(c.get_liquidity_position(&ctx.lp), 200_000);
    assert_eq!(balance(&ctx.env, &ctx.pool_token, &ctx.contract), 200_000);

    c.withdraw_liquidity(&ctx.lp, &200_000i128).unwrap();
    assert_eq!(c.get_liquidity_position(&ctx.lp), 0);
    assert_eq!(balance(&ctx.env, &ctx.pool_token, &ctx.contract), 0);
    assert_eq!(balance(&ctx.env, &ctx.pool_token, &ctx.lp), 1_000_000);
}

#[test]
fn partial_withdrawal_respects_reservation() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &10_000i128).unwrap();

    // Create a policy that reserves 8_000
    let feed = Symbol::new(&ctx.env, "WIND");
    c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &100i128,
        &TriggerCondition::GreaterThan,
        &8_000i128,
        &800i128,
        &86_400u64,
    )
    .unwrap();

    // Pool: total = 10_800, reserved = 8_000, available = 2_800
    // LP can only withdraw up to 2_800 despite having 10_000 recorded
    assert!(c.try_withdraw_liquidity(&ctx.lp, &5_000i128).is_err());
    c.withdraw_liquidity(&ctx.lp, &2_800i128).unwrap();
}

#[test]
fn zero_deposit_is_rejected() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);
    assert!(c.try_deposit_liquidity(&ctx.lp, &0i128).is_err());
}

// =============================================================================
// Policy lifecycle tests
// =============================================================================

#[test]
fn create_policy_records_correctly() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &50_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "RAINFALL");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &500i128,
        &TriggerCondition::GreaterOrEqual,
        &10_000i128,
        &1_000i128,
        &86_400u64,
    )
    .unwrap();

    let policy = c.get_policy(&id).unwrap();
    assert_eq!(policy.id, 1);
    assert_eq!(policy.policyholder, ctx.alice);
    assert_eq!(policy.coverage_amount, 10_000);
    assert_eq!(policy.premium_amount, 1_000);
    assert_eq!(policy.status, PolicyStatus::Active);

    let pool = c.get_pool_stats();
    assert_eq!(pool.reserved_liquidity, 10_000);
    assert_eq!(pool.total_premiums_collected, 1_000);
}

#[test]
fn create_policy_without_liquidity_fails() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    let feed = Symbol::new(&ctx.env, "FLOOD");
    assert!(c
        .try_create_policy(
            &ctx.alice,
            &PolicyType::NaturalDisaster,
            &feed,
            &100i128,
            &TriggerCondition::GreaterThan,
            &1_000i128,
            &100i128,
            &86_400u64,
        )
        .is_err());
}

#[test]
fn cancel_policy_releases_reservation() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &20_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "QUAKE");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::NaturalDisaster,
        &feed,
        &70i128,
        &TriggerCondition::GreaterOrEqual,
        &15_000i128,
        &500i128,
        &86_400u64,
    )
    .unwrap();

    assert_eq!(c.get_pool_stats().reserved_liquidity, 15_000);
    c.cancel_policy(&ctx.alice, &id).unwrap();
    assert_eq!(c.get_pool_stats().reserved_liquidity, 0);
    assert_eq!(c.get_policy(&id).unwrap().status, PolicyStatus::Cancelled);
}

#[test]
fn cancel_already_cancelled_policy_fails() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &10_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "HAIL");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &50i128,
        &TriggerCondition::GreaterThan,
        &5_000i128,
        &500i128,
        &86_400u64,
    )
    .unwrap();

    c.cancel_policy(&ctx.alice, &id).unwrap();
    assert!(c.try_cancel_policy(&ctx.alice, &id).is_err());
}

// =============================================================================
// Oracle trigger tests
// =============================================================================

#[test]
fn trigger_greater_than_pays_out() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &50_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "RAINFALL");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &200i128,                           // trigger when rainfall > 200
        &TriggerCondition::GreaterThan,
        &20_000i128,
        &2_000i128,
        &86_400u64,
    )
    .unwrap();

    let before = balance(&ctx.env, &ctx.pool_token, &ctx.alice);

    MockOracleClient::new(&ctx.env, &ctx.oracle)
        .set_price(&feed, &250i128, &ctx.env.ledger().timestamp());

    assert!(c.check_trigger(&id).unwrap());

    let after = balance(&ctx.env, &ctx.pool_token, &ctx.alice);
    assert_eq!(after - before, 20_000);

    let pool = c.get_pool_stats();
    assert_eq!(pool.total_payouts, 20_000);
    assert_eq!(pool.active_policies, 0);

    assert_eq!(c.get_policy(&id).unwrap().status, PolicyStatus::Claimed);
}

#[test]
fn trigger_less_than_pays_out() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &50_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "TEMP");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &(-100i128),                        // trigger when temp < -100
        &TriggerCondition::LessThan,
        &15_000i128,
        &1_500i128,
        &86_400u64,
    )
    .unwrap();

    MockOracleClient::new(&ctx.env, &ctx.oracle)
        .set_price(&feed, &(-200i128), &ctx.env.ledger().timestamp());

    assert!(c.check_trigger(&id).unwrap());
    assert_eq!(c.get_policy(&id).unwrap().status, PolicyStatus::Claimed);
}

#[test]
fn trigger_not_met_returns_false_and_keeps_active() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &50_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "WIND");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &150i128,
        &TriggerCondition::GreaterThan,
        &10_000i128,
        &1_000i128,
        &86_400u64,
    )
    .unwrap();

    MockOracleClient::new(&ctx.env, &ctx.oracle)
        .set_price(&feed, &100i128, &ctx.env.ledger().timestamp());

    assert!(!c.check_trigger(&id).unwrap());
    assert_eq!(c.get_policy(&id).unwrap().status, PolicyStatus::Active);
}

#[test]
fn trigger_on_expired_policy_returns_error() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &50_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "DROUGHT");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Crop,
        &feed,
        &10i128,
        &TriggerCondition::LessThan,
        &8_000i128,
        &800i128,
        &3_600u64,   // 1-hour policy
    )
    .unwrap();

    advance_time(&ctx.env, 7_200);   // advance 2 hours past expiry

    MockOracleClient::new(&ctx.env, &ctx.oracle)
        .set_price(&feed, &5i128, &ctx.env.ledger().timestamp());

    // check_trigger should auto-expire and return an error
    assert!(c.try_check_trigger(&id).is_err());
    assert_eq!(c.get_policy(&id).unwrap().status, PolicyStatus::Expired);
}

// =============================================================================
// Expiry tests
// =============================================================================

#[test]
fn expire_policy_before_end_time_fails() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &50_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "SNOW");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &50i128,
        &TriggerCondition::GreaterOrEqual,
        &5_000i128,
        &500i128,
        &86_400u64,
    )
    .unwrap();

    // Policy hasn't expired yet — expire_policy should fail
    assert!(c.try_expire_policy(&id).is_err());
    assert_eq!(c.get_policy(&id).unwrap().status, PolicyStatus::Active);
}

#[test]
fn expire_policy_after_end_time_succeeds() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &50_000i128).unwrap();

    let feed = Symbol::new(&ctx.env, "ICE");
    let id = c.create_policy(
        &ctx.alice,
        &PolicyType::Weather,
        &feed,
        &30i128,
        &TriggerCondition::GreaterOrEqual,
        &7_000i128,
        &700i128,
        &3_600u64,
    )
    .unwrap();

    advance_time(&ctx.env, 7_200);

    c.expire_policy(&id).unwrap();
    assert_eq!(c.get_policy(&id).unwrap().status, PolicyStatus::Expired);
    assert_eq!(c.get_pool_stats().reserved_liquidity, 0);
    assert_eq!(c.get_pool_stats().active_policies, 0);
}

// =============================================================================
// Multi-policy tests
// =============================================================================

#[test]
fn multiple_policies_track_independently() {
    let ctx = setup();
    let c = ParametricInsuranceContractClient::new(&ctx.env, &ctx.contract);

    c.deposit_liquidity(&ctx.lp, &100_000i128).unwrap();

    let bob = Address::generate(&ctx.env);
    mint(&ctx.env, &ctx.pool_token, &bob, 10_000);

    let f1 = Symbol::new(&ctx.env, "RAIN_NYC");
    let f2 = Symbol::new(&ctx.env, "DELAY_JFK");
    let f3 = Symbol::new(&ctx.env, "QUAKE_LA");

    let id1 = c
        .create_policy(
            &ctx.alice,
            &PolicyType::Weather,
            &f1,
            &200i128,
            &TriggerCondition::GreaterOrEqual,
            &10_000i128,
            &500i128,
            &86_400u64,
        )
        .unwrap();

    let id2 = c
        .create_policy(
            &ctx.alice,
            &PolicyType::FlightDelay,
            &f2,
            &120i128,
            &TriggerCondition::GreaterOrEqual,
            &5_000i128,
            &250i128,
            &172_800u64,
        )
        .unwrap();

    let id3 = c
        .create_policy(
            &bob,
            &PolicyType::NaturalDisaster,
            &f3,
            &65i128,
            &TriggerCondition::GreaterOrEqual,
            &20_000i128,
            &1_000i128,
            &86_400u64,
        )
        .unwrap();

    let pool = c.get_pool_stats();
    assert_eq!(pool.active_policies, 3);
    assert_eq!(pool.reserved_liquidity, 35_000);

    // Alice has 2 policies, Bob has 1
    assert_eq!(c.get_policies_by_holder(&ctx.alice).len(), 2);
    assert_eq!(c.get_policies_by_holder(&bob).len(), 1);

    // Trigger id1: rainfall = 250 (≥ 200 threshold)
    MockOracleClient::new(&ctx.env, &ctx.oracle)
        .set_price(&f1, &250i128, &ctx.env.ledger().timestamp());
    assert!(c.check_trigger(&id1).unwrap());

    // id2 and id3 should still be active
    assert_eq!(c.get_policy(&id2).unwrap().status, PolicyStatus::Active);
    assert_eq!(c.get_policy(&id3).unwrap().status, PolicyStatus::Active);

    let pool = c.get_pool_stats();
    assert_eq!(pool.active_policies, 2);
    assert_eq!(pool.reserved_liquidity, 25_000);
    assert_eq!(pool.total_payouts, 10_000);
}
