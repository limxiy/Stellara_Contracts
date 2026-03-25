#![no_std]
use shared::fees::FeeManager;
use shared::governance::{GovernanceManager, GovernanceRole, UpgradeProposal};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// Version of this contract implementation
const CONTRACT_VERSION: u32 = 1;

/// Maximum number of recent trades to keep in hot storage
const MAX_RECENT_TRADES: u32 = 100;

/// Storage keys as constants to avoid repeated symbol creation
mod storage_keys {
    use soroban_sdk::{symbol_short, Symbol};

    pub const INIT: Symbol = symbol_short!("init");
    pub const ROLES: Symbol = symbol_short!("roles");
    pub const STATS: Symbol = symbol_short!("stats");
    pub const VERSION: Symbol = symbol_short!("ver");
    pub const PAUSE: Symbol = symbol_short!("pause");
    pub const TRADE_COUNT: Symbol = symbol_short!("t_cnt");
}

/// Trading contract with upgradeability and governance
#[contract]
pub struct UpgradeableTradingContract;

/// Trade record for tracking - optimized with packed data
#[contracttype]
#[derive(Clone, Debug)]
pub struct Trade {
    pub id: u64,
    pub trader: Address,
    pub pair: Symbol,
    /// Signed amount: positive = buy, negative = sell (eliminates is_buy field)
    pub signed_amount: i128,
    pub price: i128,
    pub timestamp: u64,
}

/// Trading statistics - optimized (removed redundant last_trade_id)
#[contracttype]
#[derive(Clone, Debug)]
pub struct TradeStats {
    pub total_trades: u64,
    pub total_volume: i128,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TradeError {
    Unauthorized = 3001,
    InvalidAmount = 3002,
    ContractPaused = 3003,
    NotInitialized = 3004,
    InsufficientBalance = 3005,
}

impl From<TradeError> for soroban_sdk::Error {
    fn from(error: TradeError) -> Self {
        soroban_sdk::Error::from_contract_error(error as u32)
    }
}

impl From<&TradeError> for soroban_sdk::Error {
    fn from(error: &TradeError) -> Self {
        soroban_sdk::Error::from_contract_error(*error as u32)
    }
}

impl From<soroban_sdk::Error> for TradeError {
    fn from(_error: soroban_sdk::Error) -> Self {
        TradeError::Unauthorized
    }
}

#[contractimpl]
impl UpgradeableTradingContract {
    /// Initialize the contract with admin and initial approvers
    pub fn init(
        env: Env,
        admin: Address,
        approvers: soroban_sdk::Vec<Address>,
        executor: Address,
    ) -> Result<(), TradeError> {
        // Check if already initialized
        if env.storage().persistent().has(&storage_keys::INIT) {
            return Err(TradeError::Unauthorized);
        }

        // Batch storage operations - create roles map
        let mut roles = soroban_sdk::Map::new(&env);
        roles.set(admin, GovernanceRole::Admin);
        for approver in approvers.iter() {
            roles.set(approver, GovernanceRole::Approver);
        }
        roles.set(executor, GovernanceRole::Executor);

        // Initialize stats with optimized structure
        let stats = TradeStats {
            total_trades: 0,
            total_volume: 0,
        };

        // Batch write all initialization data
        let storage = env.storage().persistent();
        storage.set(&storage_keys::INIT, &true);
        storage.set(&storage_keys::ROLES, &roles);
        storage.set(&storage_keys::STATS, &stats);
        storage.set(&storage_keys::VERSION, &CONTRACT_VERSION);
        storage.set(&storage_keys::TRADE_COUNT, &0u64);

        Ok(())
    }

    /// Execute a trade with fee collection - OPTIMIZED
    pub fn trade(
        env: Env,
        trader: Address,
        pair: Symbol,
        amount: i128,
        price: i128,
        is_buy: bool,
        fee_token: Address,
        fee_amount: i128,
        fee_recipient: Address,
    ) -> Result<u64, TradeError> {
        trader.require_auth();

        // Fast-fail validation before any storage operations
        if amount <= 0 {
            return Err(TradeError::InvalidAmount);
        }

        let storage = env.storage().persistent();

        // Check pause state - single storage read
        if storage.get(&storage_keys::PAUSE).unwrap_or(false) {
            return Err(TradeError::ContractPaused);
        }

        // Collect fee after validation but before state changes
        FeeManager::collect_fee(&env, &fee_token, &trader, &fee_recipient, fee_amount)
            .map_err(|_| TradeError::InsufficientBalance)?;

        // Get trade counter - single atomic read
        let trade_id: u64 = storage.get(&storage_keys::TRADE_COUNT).unwrap_or(0) + 1;

        // Pack is_buy into signed_amount (positive = buy, negative = sell)
        let signed_amount = if is_buy { amount } else { -amount };

        // Create optimized trade record
        let trade = Trade {
            id: trade_id,
            trader: trader.clone(),
            pair,
            signed_amount,
            price,
            timestamp: env.ledger().timestamp(),
        };

        // Store individual trade by ID (O(1) access, no Vec growth)
        let trade_key = (symbol_short!("trade"), trade_id);
        storage.set(&trade_key, &trade);

        // Update stats - single read/write
        let mut stats: TradeStats = storage.get(&storage_keys::STATS).unwrap_or(TradeStats {
            total_trades: 0,
            total_volume: 0,
        });

        stats.total_trades += 1;
        stats.total_volume += amount;

        // Batch write: counter + stats (2 writes instead of 3)
        storage.set(&storage_keys::TRADE_COUNT, &trade_id);
        storage.set(&storage_keys::STATS, &stats);

        Ok(trade_id)
    }

    /// Get current contract version
    pub fn get_version(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&storage_keys::VERSION)
            .unwrap_or(0)
    }

    /// Get trading statistics
    pub fn get_stats(env: Env) -> TradeStats {
        env.storage()
            .persistent()
            .get(&storage_keys::STATS)
            .unwrap_or(TradeStats {
                total_trades: 0,
                total_volume: 0,
            })
    }

    /// Get a specific trade by ID - OPTIMIZED O(1) access
    pub fn get_trade(env: Env, trade_id: u64) -> Option<Trade> {
        let trade_key = (symbol_short!("trade"), trade_id);
        env.storage().persistent().get(&trade_key)
    }

    /// Get recent trades (last N trades) - OPTIMIZED pagination
    pub fn get_recent_trades(env: Env, count: u32) -> soroban_sdk::Vec<Trade> {
        let mut trades = soroban_sdk::Vec::new(&env);
        let trade_count: u64 = env
            .storage()
            .persistent()
            .get(&storage_keys::TRADE_COUNT)
            .unwrap_or(0);

        let limit = count.min(MAX_RECENT_TRADES).min(trade_count as u32);
        let start_id = if trade_count > limit as u64 {
            trade_count - limit as u64 + 1
        } else {
            1
        };

        for id in start_id..=trade_count {
            let trade_key = (symbol_short!("trade"), id);
            if let Some(trade) = env.storage().persistent().get(&trade_key) {
                trades.push_back(trade);
            }
        }

        trades
    }

    /// Pause the contract (admin only) - OPTIMIZED
    pub fn pause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        Self::require_admin_role(&env, &admin)?;
        env.storage().persistent().set(&storage_keys::PAUSE, &true);
        Ok(())
    }

    /// Unpause the contract (admin only) - OPTIMIZED
    pub fn unpause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        Self::require_admin_role(&env, &admin)?;
        env.storage().persistent().set(&storage_keys::PAUSE, &false);
        Ok(())
    }

    /// Helper: Verify admin role - OPTIMIZED (reusable)
    fn require_admin_role(env: &Env, admin: &Address) -> Result<(), TradeError> {
        let roles: soroban_sdk::Map<Address, GovernanceRole> = env
            .storage()
            .persistent()
            .get(&storage_keys::ROLES)
            .ok_or(TradeError::Unauthorized)?;

        let role = roles.get(admin.clone()).ok_or(TradeError::Unauthorized)?;

        if role != GovernanceRole::Admin {
            return Err(TradeError::Unauthorized);
        }

        Ok(())
    }

    /// Propose an upgrade via governance
    pub fn propose_upgrade(
        env: Env,
        admin: Address,
        new_contract_hash: Symbol,
        description: Symbol,
        approvers: soroban_sdk::Vec<Address>,
        approval_threshold: u32,
        timelock_delay: u64,
    ) -> Result<u64, TradeError> {
        admin.require_auth();

        let proposal_result = GovernanceManager::propose_upgrade(
            &env,
            admin,
            new_contract_hash,
            env.current_contract_address(),
            description,
            approval_threshold,
            approvers,
            timelock_delay,
        );

        match proposal_result {
            Ok(id) => Ok(id),
            Err(_) => Err(TradeError::Unauthorized),
        }
    }

    /// Approve an upgrade proposal
    pub fn approve_upgrade(
        env: Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), TradeError> {
        approver.require_auth();

        GovernanceManager::approve_proposal(&env, proposal_id, approver)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Execute an approved upgrade proposal
    pub fn execute_upgrade(
        env: Env,
        proposal_id: u64,
        executor: Address,
    ) -> Result<(), TradeError> {
        executor.require_auth();

        GovernanceManager::execute_proposal(&env, proposal_id, executor)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Get upgrade proposal details
    pub fn get_upgrade_proposal(env: Env, proposal_id: u64) -> Result<UpgradeProposal, TradeError> {
        GovernanceManager::get_proposal(&env, proposal_id).map_err(|_| TradeError::Unauthorized)
    }

    /// Reject an upgrade proposal
    pub fn reject_upgrade(env: Env, proposal_id: u64, rejector: Address) -> Result<(), TradeError> {
        rejector.require_auth();

        GovernanceManager::reject_proposal(&env, proposal_id, rejector)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Cancel an upgrade proposal (admin only)
    pub fn cancel_upgrade(env: Env, proposal_id: u64, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();

        GovernanceManager::cancel_proposal(&env, proposal_id, admin)
            .map_err(|_| TradeError::Unauthorized)
    }
}

#[cfg(test)]
mod test;

#[cfg(test)]
mod bench;
