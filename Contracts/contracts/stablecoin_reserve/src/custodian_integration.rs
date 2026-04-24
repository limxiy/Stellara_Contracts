use crate::{ReserveAsset, ReserveError};
use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, Map, Symbol, Vec};

const CUSTODIAN_REGISTRY: Symbol = symbol_short!("custodian_reg");
const SYNC_HISTORY: Symbol = symbol_short!("sync_history");
const LAST_SYNC: Symbol = symbol_short!("last_sync");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CustodianInfo {
    pub address: Address,
    pub name: Symbol,
    pub api_endpoint: Symbol,
    pub verification_method: VerificationMethod,
    pub is_active: bool,
    pub last_sync: u64,
    pub sync_status: SyncStatus,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VerificationMethod {
    API = 0,
    Manual = 1,
    Oracle = 2,
    MultiSig = 3,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SyncStatus {
    Success = 0,
    Pending = 1,
    Failed = 2,
    Disabled = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SyncOperation {
    pub timestamp: u64,
    pub custodian: Address,
    pub asset_type: crate::AssetType,
    pub old_amount: u128,
    pub new_amount: u128,
    pub verification_hash: BytesN<32>,
    pub status: SyncStatus,
    pub error_message: Option<Symbol>,
}

pub fn register_custodian(
    env: Env,
    address: Address,
    name: Symbol,
    api_endpoint: Symbol,
    verification_method: VerificationMethod,
) -> Result<(), ReserveError> {
    if !shared::governance::has_role(
        env.clone(),
        env.invoker(),
        shared::governance::GovernanceRole::Admin,
    ) {
        return Err(ReserveError::Unauthorized);
    }

    let custodian_info = CustodianInfo {
        address: address.clone(),
        name,
        api_endpoint,
        verification_method,
        is_active: true,
        last_sync: 0,
        sync_status: SyncStatus::Pending,
    };

    let mut registry = env
        .storage()
        .instance()
        .get(&CUSTODIAN_REGISTRY)
        .unwrap_or(Map::<Address, CustodianInfo>::new(&env));

    registry.set(address.clone(), custodian_info);
    env.storage().instance().set(&CUSTODIAN_REGISTRY, &registry);

    env.events().publish(
        (symbol_short!("custodian"), symbol_short!("registered")),
        (address, verification_method),
    );

    Ok(())
}

pub fn sync_with_custodian(env: Env, custodian: Address) -> Result<(), ReserveError> {
    let now = env.ledger().timestamp();

    let registry = env
        .storage()
        .instance()
        .get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;

    let custodian_info = registry
        .get(custodian.clone())
        .ok_or(ReserveError::CustodianError)?;

    if !custodian_info.is_active {
        return Err(ReserveError::CustodianError);
    }

    let sync_result = match custodian_info.verification_method {
        VerificationMethod::API => sync_via_api(env.clone(), &custodian_info)?,
        VerificationMethod::Manual => sync_via_manual(env.clone(), &custodian_info)?,
        VerificationMethod::Oracle => sync_via_oracle(env.clone(), &custodian_info)?,
        VerificationMethod::MultiSig => sync_via_multisig(env.clone(), &custodian_info)?,
    };

    let sync_status = sync_result.status;
    record_sync_operation(env.clone(), sync_result)?;

    let mut updated_info = custodian_info;
    updated_info.last_sync = now;
    updated_info.sync_status = sync_status;

    let mut registry = env
        .storage()
        .instance()
        .get(&CUSTODIAN_REGISTRY)
        .unwrap_or(Map::<Address, CustodianInfo>::new(&env));
    registry.set(custodian.clone(), updated_info);
    env.storage().instance().set(&CUSTODIAN_REGISTRY, &registry);

    env.storage().instance().set(&LAST_SYNC, &now);

    env.events().publish(
        (symbol_short!("custodian"), symbol_short!("synced")),
        (custodian, sync_status),
    );

    Ok(())
}

pub fn get_custodian_info(env: Env, custodian: Address) -> Result<CustodianInfo, ReserveError> {
    let registry = env
        .storage()
        .instance()
        .get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;

    registry.get(custodian).ok_or(ReserveError::CustodianError)
}

pub fn get_all_custodians(env: Env) -> Result<Vec<CustodianInfo>, ReserveError> {
    let registry = env
        .storage()
        .instance()
        .get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;

    let mut custodians: Vec<CustodianInfo> = Vec::new(&env);
    for (_, custodian_info) in registry.iter() {
        custodians.push_back(custodian_info);
    }

    Ok(custodians)
}

pub fn get_sync_history(
    env: Env,
    custodian: Option<Address>,
) -> Result<Vec<SyncOperation>, ReserveError> {
    let sync_history = env
        .storage()
        .instance()
        .get(&SYNC_HISTORY)
        .unwrap_or(Vec::<SyncOperation>::new(&env));

    if let Some(custodian_addr) = custodian {
        let mut filtered_history: Vec<SyncOperation> = Vec::new(&env);
        for operation in sync_history.iter() {
            if operation.custodian == custodian_addr {
                filtered_history.push_back(operation);
            }
        }
        Ok(filtered_history)
    } else {
        Ok(sync_history)
    }
}

pub fn deactivate_custodian(env: Env, custodian: Address) -> Result<(), ReserveError> {
    if !shared::governance::has_role(
        env.clone(),
        env.invoker(),
        shared::governance::GovernanceRole::Admin,
    ) {
        return Err(ReserveError::Unauthorized);
    }

    let mut registry = env
        .storage()
        .instance()
        .get(&CUSTODIAN_REGISTRY)
        .ok_or(ReserveError::CustodianError)?;

    let mut custodian_info = registry
        .get(custodian.clone())
        .ok_or(ReserveError::CustodianError)?;

    custodian_info.is_active = false;
    custodian_info.sync_status = SyncStatus::Disabled;

    registry.set(custodian.clone(), custodian_info);
    env.storage().instance().set(&CUSTODIAN_REGISTRY, &registry);

    env.events().publish(
        (symbol_short!("custodian"), symbol_short!("deactivated")),
        custodian,
    );

    Ok(())
}

fn sync_via_api(env: Env, custodian_info: &CustodianInfo) -> Result<SyncOperation, ReserveError> {
    let assets = env
        .storage()
        .instance()
        .get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;

    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            let new_amount = simulate_api_call(env.clone(), custodian_info, asset.asset_type)?;
            let verification_hash = generate_verification_hash(env.clone(), &new_amount);

            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address.clone(),
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount,
                verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }

    Err(ReserveError::CustodianError)
}

fn sync_via_manual(
    env: Env,
    custodian_info: &CustodianInfo,
) -> Result<SyncOperation, ReserveError> {
    let assets = env
        .storage()
        .instance()
        .get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;

    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address.clone(),
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount: asset.amount,
                verification_hash: asset.verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }

    Err(ReserveError::CustodianError)
}

fn sync_via_oracle(
    env: Env,
    custodian_info: &CustodianInfo,
) -> Result<SyncOperation, ReserveError> {
    let assets = env
        .storage()
        .instance()
        .get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;

    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            let oracle_verified_amount = simulate_oracle_verification(env.clone(), asset)?;
            let verification_hash =
                generate_verification_hash(env.clone(), &oracle_verified_amount);

            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address.clone(),
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount: oracle_verified_amount,
                verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }

    Err(ReserveError::CustodianError)
}

fn sync_via_multisig(
    env: Env,
    custodian_info: &CustodianInfo,
) -> Result<SyncOperation, ReserveError> {
    let assets = env
        .storage()
        .instance()
        .get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;

    for asset in assets.iter() {
        if asset.custodian == custodian_info.address {
            let multisig_verified_amount = simulate_multisig_verification(env.clone(), asset)?;
            let verification_hash =
                generate_verification_hash(env.clone(), &multisig_verified_amount);

            return Ok(SyncOperation {
                timestamp: env.ledger().timestamp(),
                custodian: custodian_info.address.clone(),
                asset_type: asset.asset_type,
                old_amount: asset.amount,
                new_amount: multisig_verified_amount,
                verification_hash,
                status: SyncStatus::Success,
                error_message: None,
            });
        }
    }

    Err(ReserveError::CustodianError)
}

fn simulate_api_call(
    _env: Env,
    _custodian_info: &CustodianInfo,
    asset_type: crate::AssetType,
) -> Result<u128, ReserveError> {
    match asset_type {
        crate::AssetType::USD => Ok(1_000_000_000_000u128),
        crate::AssetType::Treasury => Ok(750_000_000_000u128),
        crate::AssetType::Repo => Ok(500_000_000_000u128),
        crate::AssetType::CorporateBond => Ok(250_000_000_000u128),
        crate::AssetType::ETF => Ok(100_000_000_000u128),
    }
}

fn simulate_oracle_verification(_env: Env, asset: &ReserveAsset) -> Result<u128, ReserveError> {
    let adjustment = match asset.asset_type {
        crate::AssetType::USD => 0,
        crate::AssetType::Treasury => asset.amount / 1000,
        crate::AssetType::Repo => asset.amount / 2000,
        crate::AssetType::CorporateBond => asset.amount / 500,
        crate::AssetType::ETF => asset.amount / 1000,
    };

    Ok(asset.amount + adjustment)
}

fn simulate_multisig_verification(_env: Env, asset: &ReserveAsset) -> Result<u128, ReserveError> {
    Ok(asset.amount)
}

fn generate_verification_hash(env: Env, amount: &u128) -> BytesN<32> {
    let data = (*amount, env.ledger().timestamp());
    let hash = env.crypto().keccak256(&data.to_xdr());
    BytesN::from_array(&env, &hash)
}

fn record_sync_operation(env: Env, operation: SyncOperation) -> Result<(), ReserveError> {
    let mut sync_history = env
        .storage()
        .instance()
        .get(&SYNC_HISTORY)
        .unwrap_or(Vec::<SyncOperation>::new(&env));

    sync_history.push_back(operation);

    while sync_history.len() > 1000 {
        sync_history.pop_front();
    }

    env.storage().instance().set(&SYNC_HISTORY, &sync_history);
    Ok(())
}
