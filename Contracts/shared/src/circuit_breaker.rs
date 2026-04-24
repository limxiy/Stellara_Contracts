use crate::governance::{GovernanceManager, GovernanceRole};
use soroban_sdk::{contracttype, symbol_short, Address, Env, Map, Symbol};

/// Pause levels for graduated response
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PauseLevel {
    None = 0,
    Partial = 1, // Specific functions paused
    Full = 2,    // All non-admin functions paused
}

/// Circuit breaker configuration for automatic triggers
#[contracttype]
#[derive(Clone, Debug)]
pub struct CircuitBreakerConfig {
    pub max_volume_per_period: i128,
    pub max_tx_count_per_period: u64,
    pub period_duration: u64, // in seconds
}

/// Circuit breaker state for tracking activity
#[contracttype]
#[derive(Clone, Debug)]
pub struct CircuitBreakerState {
    pub current_period_start: u64,
    pub current_period_volume: i128,
    pub current_period_tx_count: u64,
    pub last_trigger_timestamp: u64,
    pub pause_level: PauseLevel,
}

pub struct CircuitBreaker;

impl CircuitBreaker {
    const STATE_KEY: Symbol = symbol_short!("cb_state");
    const CONFIG_KEY: Symbol = symbol_short!("cb_config");
    const PAUSED_FUNCS_KEY: Symbol = symbol_short!("cb_p_fns");

    /// Initialize circuit breaker
    pub fn init(env: &Env, config: CircuitBreakerConfig) {
        env.storage().persistent().set(&Self::CONFIG_KEY, &config);

        let state = CircuitBreakerState {
            current_period_start: env.ledger().timestamp(),
            current_period_volume: 0,
            current_period_tx_count: 0,
            last_trigger_timestamp: 0,
            pause_level: PauseLevel::None,
        };
        env.storage().persistent().set(&Self::STATE_KEY, &state);
    }

    /// Check if a function is paused
    pub fn require_not_paused(env: &Env, func_name: Symbol) {
        let state = Self::get_state(env);

        if state.pause_level == PauseLevel::Full {
            panic!("CONTRACT_FULLY_PAUSED");
        }

        if state.pause_level == PauseLevel::Partial {
            let paused_funcs: Map<Symbol, bool> = env
                .storage()
                .persistent()
                .get(&Self::PAUSED_FUNCS_KEY)
                .unwrap_or_else(|| Map::new(env));

            if paused_funcs.get(func_name).unwrap_or(false) {
                panic!("FUNCTION_PAUSED");
            }
        }
    }

    /// Track activity and trigger circuit breaker if thresholds exceeded
    pub fn track_activity(env: &Env, volume: i128) {
        let config: CircuitBreakerConfig = env
            .storage()
            .persistent()
            .get(&Self::CONFIG_KEY)
            .expect("CB_NOT_INIT");

        let mut state = Self::get_state(env);
        let now = env.ledger().timestamp();

        // Reset period if duration exceeded
        if now >= state.current_period_start + config.period_duration {
            state.current_period_start = now;
            state.current_period_volume = 0;
            state.current_period_tx_count = 0;
        }

        state.current_period_volume += volume;
        state.current_period_tx_count += 1;

        // Check for anomalies
        let mut triggered = false;
        if state.current_period_volume >= config.max_volume_per_period {
            triggered = true;
        }
        if state.current_period_tx_count >= config.max_tx_count_per_period {
            triggered = true;
        }

        if triggered && state.pause_level == PauseLevel::None {
            state.pause_level = PauseLevel::Full;
            state.last_trigger_timestamp = now;

            // Emit event
            env.events().publish(
                (symbol_short!("cb_trig"),),
                (state.current_period_volume, state.current_period_tx_count),
            );
        }

        env.storage().persistent().set(&Self::STATE_KEY, &state);
    }

    /// Set pause level (Admin only)
    pub fn set_pause_level(env: &Env, admin: Address, level: PauseLevel) {
        admin.require_auth();
        GovernanceManager::require_role(env, &admin, GovernanceRole::Admin);

        let mut state = Self::get_state(env);
        state.pause_level = level;
        env.storage().persistent().set(&Self::STATE_KEY, &state);

        env.events()
            .publish((symbol_short!("cb_pause"),), (level as u32,));
    }

    /// Pause specific function (Admin only)
    pub fn pause_function(env: &Env, admin: Address, func_name: Symbol) {
        admin.require_auth();
        GovernanceManager::require_role(env, &admin, GovernanceRole::Admin);

        let mut paused_funcs: Map<Symbol, bool> = env
            .storage()
            .persistent()
            .get(&Self::PAUSED_FUNCS_KEY)
            .unwrap_or_else(|| Map::new(env));

        paused_funcs.set(func_name.clone(), true);
        env.storage()
            .persistent()
            .set(&Self::PAUSED_FUNCS_KEY, &paused_funcs);

        let mut state = Self::get_state(env);
        if state.pause_level == PauseLevel::None {
            state.pause_level = PauseLevel::Partial;
            env.storage().persistent().set(&Self::STATE_KEY, &state);
        }

        env.events()
            .publish((symbol_short!("cb_f_psd"), func_name), ());
    }

    /// Unpause specific function (Admin only)
    pub fn unpause_function(env: &Env, admin: Address, func_name: Symbol) {
        admin.require_auth();
        GovernanceManager::require_role(env, &admin, GovernanceRole::Admin);

        let mut paused_funcs: Map<Symbol, bool> = env
            .storage()
            .persistent()
            .get(&Self::PAUSED_FUNCS_KEY)
            .unwrap_or_else(|| Map::new(env));

        paused_funcs.remove(func_name.clone());
        env.storage()
            .persistent()
            .set(&Self::PAUSED_FUNCS_KEY, &paused_funcs);

        // If no more paused functions, we could potentially set level to None,
        // but it's safer to let admin decide.

        env.events()
            .publish((symbol_short!("cb_f_ups"), func_name), ());
    }

    pub fn get_state(env: &Env) -> CircuitBreakerState {
        env.storage()
            .persistent()
            .get(&Self::STATE_KEY)
            .unwrap_or(CircuitBreakerState {
                current_period_start: 0,
                current_period_volume: 0,
                current_period_tx_count: 0,
                last_trigger_timestamp: 0,
                pause_level: PauseLevel::None,
            })
    }

    pub fn get_config(env: &Env) -> CircuitBreakerConfig {
        env.storage()
            .persistent()
            .get(&Self::CONFIG_KEY)
            .expect("CB_NOT_INIT")
    }
}
