//! Storage layer for the Parametric Insurance Protocol
//!
//! Storage tier strategy:
//!   Instance   – admin, pool_token, oracle config, pool stats, pause flag, counter
//!   Persistent – individual policies, LP positions, per-holder policy ID indexes

use soroban_sdk::{contracttype, Address, Env, Vec};

use crate::types::{InsurancePolicy, OracleConfig, PolicyStatus, RiskPool};

// =============================================================================
// Storage keys
// =============================================================================

#[contracttype]
#[derive(Clone, Debug)]
pub enum InsuranceDataKey {
    /// Initialization flag
    Init,
    /// Admin address
    Admin,
    /// Pause flag
    Paused,
    /// ERC-20-compatible token used for premiums and payouts
    PoolToken,
    /// Oracle source list + staleness settings
    OracleConfig,
    /// Monotonically increasing policy counter
    PolicyCounter,
    /// Aggregated risk pool accounting
    RiskPool,
    /// Individual policy record keyed by policy ID
    Policy(u64),
    /// Amount an LP deposited (Address → i128)
    LiquidityProvider(Address),
    /// List of policy IDs owned by a holder (Address → Vec<u64>)
    PolicyIdsByHolder(Address),
}

// =============================================================================
// Storage manager
// =============================================================================

pub struct InsuranceStorage;

impl InsuranceStorage {
    // ── Initialization ────────────────────────────────────────────────────────

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&InsuranceDataKey::Init)
    }

    pub fn set_initialized(env: &Env) {
        env.storage().instance().set(&InsuranceDataKey::Init, &true);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    pub fn set_admin(env: &Env, admin: &Address) {
        env.storage().instance().set(&InsuranceDataKey::Admin, admin);
    }

    pub fn get_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&InsuranceDataKey::Admin)
    }

    pub fn is_admin(env: &Env, address: &Address) -> bool {
        Self::get_admin(env).map(|a| a == *address).unwrap_or(false)
    }

    // ── Pause ─────────────────────────────────────────────────────────────────

    pub fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&InsuranceDataKey::Paused)
            .unwrap_or(false)
    }

    pub fn set_paused(env: &Env, paused: bool) {
        env.storage()
            .instance()
            .set(&InsuranceDataKey::Paused, &paused);
    }

    // ── Pool token ────────────────────────────────────────────────────────────

    pub fn set_pool_token(env: &Env, token: &Address) {
        env.storage()
            .instance()
            .set(&InsuranceDataKey::PoolToken, token);
    }

    pub fn get_pool_token(env: &Env) -> Option<Address> {
        env.storage().instance().get(&InsuranceDataKey::PoolToken)
    }

    // ── Oracle config ─────────────────────────────────────────────────────────

    pub fn set_oracle_config(env: &Env, config: &OracleConfig) {
        env.storage()
            .instance()
            .set(&InsuranceDataKey::OracleConfig, config);
    }

    pub fn get_oracle_config(env: &Env) -> Option<OracleConfig> {
        env.storage().instance().get(&InsuranceDataKey::OracleConfig)
    }

    // ── Risk pool ─────────────────────────────────────────────────────────────

    pub fn get_pool(env: &Env) -> RiskPool {
        env.storage()
            .instance()
            .get(&InsuranceDataKey::RiskPool)
            .unwrap_or_else(RiskPool::new)
    }

    pub fn set_pool(env: &Env, pool: &RiskPool) {
        env.storage()
            .instance()
            .set(&InsuranceDataKey::RiskPool, pool);
    }

    // ── Policy counter ────────────────────────────────────────────────────────

    pub fn next_policy_id(env: &Env) -> u64 {
        let counter: u64 = env
            .storage()
            .instance()
            .get(&InsuranceDataKey::PolicyCounter)
            .unwrap_or(0);
        let next = counter + 1;
        env.storage()
            .instance()
            .set(&InsuranceDataKey::PolicyCounter, &next);
        next
    }

    pub fn current_policy_id(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&InsuranceDataKey::PolicyCounter)
            .unwrap_or(0)
    }

    // ── Policy CRUD (persistent) ──────────────────────────────────────────────

    pub fn set_policy(env: &Env, policy: &InsurancePolicy) {
        let key = InsuranceDataKey::Policy(policy.id);
        env.storage().persistent().set(&key, policy);
        Self::add_policy_to_holder_index(env, &policy.policyholder, policy.id);
    }

    pub fn get_policy(env: &Env, policy_id: u64) -> Option<InsurancePolicy> {
        env.storage()
            .persistent()
            .get(&InsuranceDataKey::Policy(policy_id))
    }

    pub fn update_policy_status(env: &Env, policy_id: u64, status: PolicyStatus) {
        if let Some(mut policy) = Self::get_policy(env, policy_id) {
            policy.status = status;
            env.storage()
                .persistent()
                .set(&InsuranceDataKey::Policy(policy_id), &policy);
        }
    }

    // ── Holder index (persistent) ─────────────────────────────────────────────

    fn add_policy_to_holder_index(env: &Env, holder: &Address, policy_id: u64) {
        let key = InsuranceDataKey::PolicyIdsByHolder(holder.clone());
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));
        // Only add if not already tracked (guard against double-insert)
        for existing in ids.iter() {
            if existing == policy_id {
                return;
            }
        }
        ids.push_back(policy_id);
        env.storage().persistent().set(&key, &ids);
    }

    pub fn get_policy_ids_by_holder(env: &Env, holder: &Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&InsuranceDataKey::PolicyIdsByHolder(holder.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    pub fn get_policies_by_holder(env: &Env, holder: &Address) -> Vec<InsurancePolicy> {
        let ids = Self::get_policy_ids_by_holder(env, holder);
        let mut policies = Vec::new(env);
        for id in ids.iter() {
            if let Some(p) = Self::get_policy(env, id) {
                policies.push_back(p);
            }
        }
        policies
    }

    // ── LP positions (persistent) ─────────────────────────────────────────────

    pub fn get_lp_balance(env: &Env, provider: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&InsuranceDataKey::LiquidityProvider(provider.clone()))
            .unwrap_or(0)
    }

    pub fn set_lp_balance(env: &Env, provider: &Address, amount: i128) {
        env.storage()
            .persistent()
            .set(&InsuranceDataKey::LiquidityProvider(provider.clone()), &amount);
    }
}
