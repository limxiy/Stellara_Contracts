use crate::{AssetType, ReserveAsset, ReserveError};
use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Vec};

const REBALANCING_THRESHOLD: Symbol = symbol_short!("rebal_threshold");
const TARGET_ALLOCATIONS: Symbol = symbol_short!("target_alloc");
const LAST_REBALANCING: Symbol = symbol_short!("last_rebal");
const REBALANCING_HISTORY: Symbol = symbol_short!("rebal_history");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TargetAllocation {
    pub asset_type: AssetType,
    pub target_percentage: u64, // in basis points (10000 = 100%)
    pub min_percentage: u64,
    pub max_percentage: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RebalancingOperation {
    pub timestamp: u64,
    pub asset_type: AssetType,
    pub old_amount: u128,
    pub new_amount: u128,
    pub reason: Symbol,
}

pub fn initialize(env: Env, threshold: u64) {
    env.storage()
        .instance()
        .set(&REBALANCING_THRESHOLD, &threshold);
    env.storage().instance().set(&LAST_REBALANCING, &0u64);
    env.storage().instance().set(
        &REBALANCING_HISTORY,
        &Vec::<RebalancingOperation>::new(&env),
    );

    // Set default target allocations
    let default_allocations = vec![
        &env,
        TargetAllocation {
            asset_type: AssetType::USD,
            target_percentage: 4000, // 40%
            min_percentage: 3500,    // 35%
            max_percentage: 4500,    // 45%
        },
        TargetAllocation {
            asset_type: AssetType::Treasury,
            target_percentage: 3000, // 30%
            min_percentage: 2500,    // 25%
            max_percentage: 3500,    // 35%
        },
        TargetAllocation {
            asset_type: AssetType::Repo,
            target_percentage: 2000, // 20%
            min_percentage: 1500,    // 15%
            max_percentage: 2500,    // 25%
        },
        TargetAllocation {
            asset_type: AssetType::CorporateBond,
            target_percentage: 1000, // 10%
            min_percentage: 500,     // 5%
            max_percentage: 1500,    // 15%
        },
    ];

    env.storage()
        .instance()
        .set(&TARGET_ALLOCATIONS, &default_allocations);
}

pub fn check_rebalancing_needed(env: Env) -> Result<bool, ReserveError> {
    let assets = env
        .storage()
        .instance()
        .get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;

    let threshold = env
        .storage()
        .instance()
        .get(&REBALANCING_THRESHOLD)
        .unwrap_or(500); // Default 5%

    let total_reserves: u128 = assets.iter().map(|asset| asset.amount).sum();
    if total_reserves == 0 {
        return Ok(false);
    }

    let target_allocations = env
        .storage()
        .instance()
        .get(&TARGET_ALLOCATIONS)
        .unwrap_or(Vec::new(&env));

    // Check each asset type's allocation
    for target in target_allocations.iter() {
        let current_amount = get_asset_amount_by_type(&assets, target.asset_type);
        let current_percentage = (current_amount * 10000) / total_reserves;

        let deviation = if current_percentage > target.target_percentage {
            current_percentage - target.target_percentage
        } else {
            target.target_percentage - current_percentage
        };

        if deviation > threshold {
            return Ok(true);
        }
    }

    Ok(false)
}

pub fn execute_rebalancing(env: Env) -> Result<(), ReserveError> {
    let now = env.ledger().timestamp();

    // Check if rebalancing is needed
    if !check_rebalancing_needed(env.clone())? {
        return Err(ReserveError::RebalancingRequired);
    }

    let mut assets = env
        .storage()
        .instance()
        .get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;

    let total_reserves: u128 = assets.iter().map(|asset| asset.amount).sum();
    if total_reserves == 0 {
        return Err(ReserveError::InsufficientReserves);
    }

    let target_allocations = env
        .storage()
        .instance()
        .get(&TARGET_ALLOCATIONS)
        .unwrap_or(Vec::new(&env));

    let mut rebalancing_operations: Vec<RebalancingOperation> = Vec::new(&env);

    // Calculate required adjustments for each asset type
    for target in target_allocations.iter() {
        let current_amount = get_asset_amount_by_type(&assets, target.asset_type);
        let current_percentage = (current_amount * 10000) / total_reserves;

        let target_amount = (total_reserves * target.target_percentage) / 10000;

        if current_amount != target_amount {
            let operation = RebalancingOperation {
                timestamp: now,
                asset_type: target.asset_type,
                old_amount: current_amount,
                new_amount: target_amount,
                reason: symbol_short!("rebalancing"),
            };

            rebalancing_operations.push_back(operation);

            // Update asset amounts (in production, this would involve actual trades)
            update_asset_amount_by_type(&mut assets, target.asset_type, target_amount);
        }
    }

    // Store updated assets
    env.storage()
        .instance()
        .set(&symbol_short!("reserve_assets"), &assets);

    // Update rebalancing history
    let mut history = env
        .storage()
        .instance()
        .get(&REBALANCING_HISTORY)
        .unwrap_or(Vec::new(&env));

    for operation in rebalancing_operations.iter() {
        history.push_back(operation.clone());
    }

    // Keep only last 100 rebalancing operations
    while history.len() > 100 {
        history.pop_front();
    }

    env.storage().instance().set(&REBALANCING_HISTORY, &history);
    env.storage().instance().set(&LAST_REBALANCING, &now);

    // Log rebalancing
    env.events().publish(
        (symbol_short!("rebalancing"), symbol_short!("executed")),
        (now, rebalancing_operations.len()),
    );

    // Update reserve snapshot
    crate::reserve_tracking::update_snapshot(env.clone())?;

    Ok(())
}

pub fn update_target_allocation(
    env: Env,
    asset_type: AssetType,
    target_percentage: u64,
    min_percentage: u64,
    max_percentage: u64,
) -> Result<(), ReserveError> {
    // Check governance authorization
    if !shared::governance::has_role(
        env.clone(),
        env.invoker(),
        shared::governance::GovernanceRole::Admin,
    ) {
        return Err(ReserveError::Unauthorized);
    }

    let mut allocations = env
        .storage()
        .instance()
        .get(&TARGET_ALLOCATIONS)
        .unwrap_or(Vec::new(&env));

    // Find and update the target allocation
    let mut found = false;
    for i in 0..allocations.len() {
        let allocation = allocations.get(i).unwrap();
        if allocation.asset_type == asset_type {
            let updated_allocation = TargetAllocation {
                asset_type,
                target_percentage,
                min_percentage,
                max_percentage,
            };
            allocations.set(i, updated_allocation);
            found = true;
            break;
        }
    }

    if !found {
        // Add new target allocation
        let new_allocation = TargetAllocation {
            asset_type,
            target_percentage,
            min_percentage,
            max_percentage,
        };
        allocations.push_back(new_allocation);
    }

    env.storage()
        .instance()
        .set(&TARGET_ALLOCATIONS, &allocations);

    // Log allocation update
    env.events().publish(
        (symbol_short!("allocation"), symbol_short!("updated")),
        (asset_type, target_percentage),
    );

    Ok(())
}

pub fn get_rebalancing_history(env: Env) -> Result<Vec<RebalancingOperation>, ReserveError> {
    env.storage()
        .instance()
        .get(&REBALANCING_HISTORY)
        .ok_or(ReserveError::InvalidAsset)
}

pub fn get_target_allocations(env: Env) -> Result<Vec<TargetAllocation>, ReserveError> {
    env.storage()
        .instance()
        .get(&TARGET_ALLOCATIONS)
        .ok_or(ReserveError::InvalidAsset)
}

fn get_asset_amount_by_type(assets: &Vec<ReserveAsset>, asset_type: AssetType) -> u128 {
    assets
        .iter()
        .filter(|asset| asset.asset_type == asset_type)
        .map(|asset| asset.amount)
        .sum()
}

fn update_asset_amount_by_type(
    assets: &mut Vec<ReserveAsset>,
    asset_type: AssetType,
    new_amount: u128,
) {
    for i in 0..assets.len() {
        let asset = assets.get(i).unwrap();
        if asset.asset_type == asset_type {
            let updated_asset = ReserveAsset {
                amount: new_amount,
                ..asset
            };
            assets.set(i, updated_asset);
            break;
        }
    }
}
