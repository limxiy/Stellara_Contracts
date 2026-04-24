use crate::{AssetType, ReserveAsset, ReserveError, ReserveSnapshot};
use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, Symbol, Vec};

const RESERVE_ASSETS: Symbol = symbol_short!("reserve_assets");
const RESERVE_SNAPSHOTS: Symbol = symbol_short!("snapshots");
const CURRENT_SNAPSHOT: Symbol = symbol_short!("current_snapshot");
const TOTAL_SUPPLY: Symbol = symbol_short!("total_supply");

pub fn initialize(env: Env) {
    // Initialize empty reserve assets list
    env.storage()
        .instance()
        .set(&RESERVE_ASSETS, &Vec::<ReserveAsset>::new(&env));

    // Initialize snapshots list
    env.storage()
        .instance()
        .set(&RESERVE_SNAPSHOTS, &Vec::<ReserveSnapshot>::new(&env));

    // Initialize total supply to 0
    env.storage().instance().set(&TOTAL_SUPPLY, &0u128);
}

pub fn add_asset(
    env: Env,
    asset_type: AssetType,
    amount: u128,
    custodian: Address,
    verification_hash: BytesN<32>,
) -> Result<(), ReserveError> {
    let mut assets = env
        .storage()
        .instance()
        .get(&RESERVE_ASSETS)
        .unwrap_or(Vec::new(&env));

    // Create new reserve asset
    let new_asset = ReserveAsset {
        asset_type,
        amount,
        custodian,
        last_verified: env.ledger().timestamp(),
        verification_hash,
    };

    assets.push_back(new_asset);
    env.storage().instance().set(&RESERVE_ASSETS, &assets);

    // Update snapshot
    update_snapshot(env.clone())?;

    // Log asset addition
    env.events().publish(
        (symbol_short!("reserve"), symbol_short!("asset_added")),
        (asset_type, amount, custodian),
    );

    Ok(())
}

pub fn update_asset(
    env: Env,
    asset_index: u32,
    new_amount: u128,
    verification_hash: BytesN<32>,
) -> Result<(), ReserveError> {
    let mut assets = env
        .storage()
        .instance()
        .get(&RESERVE_ASSETS)
        .ok_or(ReserveError::InvalidAsset)?;

    if asset_index as usize >= assets.len() {
        return Err(ReserveError::InvalidAsset);
    }

    let asset = assets.get(asset_index as usize).unwrap();
    let updated_asset = ReserveAsset {
        amount: new_amount,
        last_verified: env.ledger().timestamp(),
        verification_hash,
        ..asset
    };

    assets.set(asset_index as usize, updated_asset);
    env.storage().instance().set(&RESERVE_ASSETS, &assets);

    // Update snapshot
    update_snapshot(env.clone())?;

    // Log asset update
    env.events().publish(
        (symbol_short!("reserve"), symbol_short!("asset_updated")),
        (asset_index, new_amount),
    );

    Ok(())
}

pub fn get_current_snapshot(env: Env) -> Result<ReserveSnapshot, ReserveError> {
    env.storage()
        .instance()
        .get(&CURRENT_SNAPSHOT)
        .ok_or(ReserveError::InvalidAsset)
}

pub fn get_reserve_ratio(env: Env) -> Result<u64, ReserveError> {
    let snapshot = get_current_snapshot(env.clone())?;
    Ok(snapshot.reserve_ratio)
}

pub fn get_total_reserves(env: Env) -> Result<u128, ReserveError> {
    let snapshot = get_current_snapshot(env.clone())?;
    Ok(snapshot.total_reserves)
}

pub fn update_total_supply(env: Env, new_supply: u128) -> Result<(), ReserveError> {
    env.storage().instance().set(&TOTAL_SUPPLY, &new_supply);
    update_snapshot(env.clone())
}

fn update_snapshot(env: Env) -> Result<(), ReserveError> {
    let assets = env
        .storage()
        .instance()
        .get(&RESERVE_ASSETS)
        .unwrap_or(Vec::new(&env));
    let total_supply = env.storage().instance().get(&TOTAL_SUPPLY).unwrap_or(0u128);

    // Calculate total reserves
    let total_reserves: u128 = assets.iter().map(|asset| asset.amount).sum();

    // Calculate reserve ratio (in basis points)
    let reserve_ratio = if total_supply > 0 {
        (total_reserves * 10000) / total_supply
    } else {
        10000 // 100% if no supply
    };

    // Generate Merkle root (simplified - in production would use proper Merkle tree)
    let merkle_root = generate_merkle_root(env.clone(), &assets)?;

    let snapshot = ReserveSnapshot {
        timestamp: env.ledger().timestamp(),
        total_reserves,
        total_supply,
        reserve_ratio,
        assets: assets.clone(),
        merkle_root,
    };

    // Store current snapshot
    env.storage().instance().set(&CURRENT_SNAPSHOT, &snapshot);

    // Add to history (keep last 365 days)
    let mut snapshots = env
        .storage()
        .instance()
        .get(&RESERVE_SNAPSHOTS)
        .unwrap_or(Vec::new(&env));
    snapshots.push_back(snapshot.clone());

    // Keep only last 365 snapshots
    while snapshots.len() > 365 {
        snapshots.pop_front();
    }

    env.storage().instance().set(&RESERVE_SNAPSHOTS, &snapshots);

    // Check reserve ratio compliance
    if reserve_ratio < 10000 {
        // Less than 100%
        env.events().publish(
            (symbol_short!("reserve"), symbol_short!("ratio_warning")),
            (reserve_ratio, total_reserves, total_supply),
        );
    }

    Ok(())
}

fn generate_merkle_root(env: Env, assets: &Vec<ReserveAsset>) -> Result<BytesN<32>, ReserveError> {
    // Simplified Merkle root generation
    // In production, this would be a proper Merkle tree implementation
    let mut combined_hash = [0u8; 32];

    for (i, asset) in assets.iter().enumerate() {
        let asset_bytes = env.crypto().keccak256(&asset.amount.to_be_bytes());
        for j in 0..32 {
            combined_hash[j] ^= asset_bytes[j];
        }
    }

    Ok(BytesN::from_array(&env, &combined_hash))
}

pub fn verify_asset_compliance(env: Env, asset: &ReserveAsset) -> Result<bool, ReserveError> {
    // Verify asset is properly collateralized
    let now = env.ledger().timestamp();
    let max_age = 24 * 60 * 60; // 24 hours

    if now - asset.last_verified > max_age {
        return Ok(false);
    }

    // Verify custodian is authorized
    // In production, this would check against a list of authorized custodians
    Ok(true)
}
