use crate::{RedemptionRequest, RedemptionStatus, ReserveError};
use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Vec};

const REDEMPTION_REQUESTS: Symbol = symbol_short!("redemption_reqs");
const REDEMPTION_COUNTER: Symbol = symbol_short!("redemption_counter");
const LARGE_HOLDER_THRESHOLD: u128 = 1_000_000_000_000; // $1M in smallest units
const REDEMPTION_QUEUE: Symbol = symbol_short!("redemption_queue");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RedemptionQueue {
    pub pending_requests: Vec<u64>, // Request IDs
    pub total_pending_amount: u128,
    pub last_processed: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RedemptionConfig {
    pub large_holder_threshold: u128,
    pub processing_delay: u64, // Time delay before processing
    pub max_daily_redemption: u128,
    pub emergency_pause: bool,
}

pub fn request_redemption(env: Env, requester: Address, amount: u128) -> Result<u64, ReserveError> {
    let now = env.ledger().timestamp();

    // Check if redemption is paused
    let config = get_redemption_config(env.clone())?;
    if config.emergency_pause {
        return Err(ReserveError::RedemptionAmountTooSmall);
    }

    // Check minimum amount
    if amount < config.large_holder_threshold {
        return Err(ReserveError::RedemptionAmountTooSmall);
    }

    // Check maximum daily redemption limit
    let daily_total = get_daily_redemption_total(env.clone())?;
    if daily_total + amount > config.max_daily_redemption {
        return Err(ReserveError::RedemptionAmountTooLarge);
    }

    // Verify sufficient reserves
    let total_reserves = crate::reserve_tracking::get_total_reserves(env.clone())?;
    let total_supply = env
        .storage()
        .instance()
        .get(&symbol_short!("total_supply"))
        .unwrap_or(0u128);

    if total_reserves < amount {
        return Err(ReserveError::InsufficientReserves);
    }

    // Create redemption request
    let request_id = get_next_request_id(env.clone())?;
    let request = RedemptionRequest {
        requester: requester.clone(),
        amount,
        request_time: now,
        status: RedemptionStatus::Pending,
        processed_time: None,
    };

    // Store request
    let mut requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .unwrap_or(Vec::<RedemptionRequest>::new(&env));
    requests.push_back(request);
    env.storage()
        .instance()
        .set(&REDEMPTION_REQUESTS, &requests);

    // Add to queue
    add_to_queue(env.clone(), request_id, amount)?;

    // Log redemption request
    env.events().publish(
        (symbol_short!("redemption"), symbol_short!("requested")),
        (requester, amount, request_id),
    );

    Ok(request_id)
}

pub fn process_redemption(env: Env, request_id: u64) -> Result<(), ReserveError> {
    // Check authorization
    if !shared::governance::has_role(
        env.clone(),
        env.invoker(),
        shared::governance::GovernanceRole::Executor,
    ) {
        return Err(ReserveError::Unauthorized);
    }

    let now = env.ledger().timestamp();
    let config = get_redemption_config(env.clone())?;

    // Get redemption request
    let mut requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    let mut request = None;
    for i in 0..requests.len() {
        let req = requests.get(i).unwrap();
        if get_request_id(&req) == request_id {
            request = Some(req);
            break;
        }
    }

    let mut request = request.ok_or(ReserveError::RedemptionAmountTooSmall)?;

    // Check if request can be processed
    if request.status != RedemptionStatus::Pending {
        return Err(ReserveError::RedemptionAmountTooSmall);
    }

    // Check processing delay
    if now - request.request_time < config.processing_delay {
        return Err(ReserveError::RedemptionAmountTooSmall);
    }

    // Verify sufficient reserves again
    let total_reserves = crate::reserve_tracking::get_total_reserves(env.clone())?;
    if total_reserves < request.amount {
        request.status = RedemptionStatus::Rejected;
        update_request(env.clone(), request_id, request)?;
        return Err(ReserveError::InsufficientReserves);
    }

    // Process redemption
    // In a real implementation, this would:
    // 1. Burn the stablecoin tokens
    // 2. Transfer reserve assets to the requester
    // 3. Update reserve tracking

    // For now, we'll simulate the processing
    request.status = RedemptionStatus::Processed;
    request.processed_time = Some(now);

    // Update request
    update_request(env.clone(), request_id, request)?;

    // Remove from queue
    remove_from_queue(env.clone(), request_id, request.amount)?;

    // Update total supply (reduce by redemption amount)
    let current_supply = env
        .storage()
        .instance()
        .get(&symbol_short!("total_supply"))
        .unwrap_or(0u128);
    let new_supply = current_supply - request.amount;
    env.storage()
        .instance()
        .set(&symbol_short!("total_supply"), &new_supply);

    // Update reserve snapshot
    crate::reserve_tracking::update_total_supply(env.clone(), new_supply)?;

    // Log redemption processing
    env.events().publish(
        (symbol_short!("redemption"), symbol_short!("processed")),
        (request.requester, request.amount, request_id),
    );

    Ok(())
}

pub fn approve_redemption(env: Env, request_id: u64) -> Result<(), ReserveError> {
    // Check authorization
    if !shared::governance::has_role(
        env.clone(),
        env.invoker(),
        shared::governance::GovernanceRole::Admin,
    ) {
        return Err(ReserveError::Unauthorized);
    }

    let mut requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    let mut request = get_request_by_id(&requests, request_id)?;

    if request.status != RedemptionStatus::Pending {
        return Err(ReserveError::RedemptionAmountTooSmall);
    }

    request.status = RedemptionStatus::Approved;
    update_request(env.clone(), request_id, request)?;

    // Log approval
    env.events().publish(
        (symbol_short!("redemption"), symbol_short!("approved")),
        (request.requester, request.amount, request_id),
    );

    Ok(())
}

pub fn reject_redemption(env: Env, request_id: u64, reason: Symbol) -> Result<(), ReserveError> {
    // Check authorization
    if !shared::governance::has_role(
        env.clone(),
        env.invoker(),
        shared::governance::GovernanceRole::Admin,
    ) {
        return Err(ReserveError::Unauthorized);
    }

    let mut requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    let mut request = get_request_by_id(&requests, request_id)?;

    if request.status != RedemptionStatus::Pending {
        return Err(ReserveError::RedemptionAmountTooSmall);
    }

    request.status = RedemptionStatus::Rejected;
    update_request(env.clone(), request_id, request)?;

    // Remove from queue
    remove_from_queue(env.clone(), request_id, request.amount)?;

    // Log rejection
    env.events().publish(
        (symbol_short!("redemption"), symbol_short!("rejected")),
        (request.requester, request.amount, request_id, reason),
    );

    Ok(())
}

pub fn get_redemption_request(
    env: Env,
    request_id: u64,
) -> Result<RedemptionRequest, ReserveError> {
    let requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    get_request_by_id(&requests, request_id)
}

pub fn get_pending_redemptions(env: Env) -> Result<Vec<RedemptionRequest>, ReserveError> {
    let requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    let mut pending: Vec<RedemptionRequest> = Vec::new(&env);
    for request in requests.iter() {
        if request.status == RedemptionStatus::Pending {
            pending.push_back(request);
        }
    }

    Ok(pending)
}

pub fn get_redemption_queue(env: Env) -> Result<RedemptionQueue, ReserveError> {
    env.storage()
        .instance()
        .get(&REDEMPTION_QUEUE)
        .ok_or(ReserveError::RedemptionAmountTooSmall)
}

pub fn update_redemption_config(
    env: Env,
    large_holder_threshold: u128,
    processing_delay: u64,
    max_daily_redemption: u128,
    emergency_pause: bool,
) -> Result<(), ReserveError> {
    // Check authorization
    if !shared::governance::has_role(
        env.clone(),
        env.invoker(),
        shared::governance::GovernanceRole::Admin,
    ) {
        return Err(ReserveError::Unauthorized);
    }

    let config = RedemptionConfig {
        large_holder_threshold,
        processing_delay,
        max_daily_redemption,
        emergency_pause,
    };

    env.storage()
        .instance()
        .set(&symbol_short!("redemption_config"), &config);

    // Log config update
    env.events().publish(
        (symbol_short!("redemption"), symbol_short!("config_updated")),
        (
            large_holder_threshold,
            processing_delay,
            max_daily_redemption,
            emergency_pause,
        ),
    );

    Ok(())
}

fn get_next_request_id(env: Env) -> Result<u64, ReserveError> {
    let counter = env
        .storage()
        .instance()
        .get(&REDEMPTION_COUNTER)
        .unwrap_or(0u64);
    let next_id = counter + 1;
    env.storage().instance().set(&REDEMPTION_COUNTER, &next_id);
    Ok(next_id)
}

fn add_to_queue(env: Env, request_id: u64, amount: u128) -> Result<(), ReserveError> {
    let mut queue = env
        .storage()
        .instance()
        .get(&REDEMPTION_QUEUE)
        .unwrap_or(RedemptionQueue {
            pending_requests: Vec::new(&env),
            total_pending_amount: 0,
            last_processed: 0,
        });

    queue.pending_requests.push_back(request_id);
    queue.total_pending_amount += amount;

    env.storage().instance().set(&REDEMPTION_QUEUE, &queue);
    Ok(())
}

fn remove_from_queue(env: Env, request_id: u64, amount: u128) -> Result<(), ReserveError> {
    let mut queue = env
        .storage()
        .instance()
        .get(&REDEMPTION_QUEUE)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    // Remove request ID from queue
    let mut new_requests: Vec<u64> = Vec::new(&env);
    for req_id in queue.pending_requests.iter() {
        if req_id != request_id {
            new_requests.push_back(req_id);
        }
    }

    queue.pending_requests = new_requests;
    queue.total_pending_amount = queue.total_pending_amount.saturating_sub(amount);
    queue.last_processed = env.ledger().timestamp();

    env.storage().instance().set(&REDEMPTION_QUEUE, &queue);
    Ok(())
}

fn update_request(
    env: Env,
    request_id: u64,
    request: RedemptionRequest,
) -> Result<(), ReserveError> {
    let mut requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    for i in 0..requests.len() {
        let req = requests.get(i).unwrap();
        if get_request_id(&req) == request_id {
            requests.set(i, request);
            break;
        }
    }

    env.storage()
        .instance()
        .set(&REDEMPTION_REQUESTS, &requests);
    Ok(())
}

fn get_request_by_id(
    requests: &Vec<RedemptionRequest>,
    request_id: u64,
) -> Result<RedemptionRequest, ReserveError> {
    for i in 0..requests.len() {
        let request = requests.get(i).unwrap();
        if get_request_id(&request) == request_id {
            return Ok(request);
        }
    }
    Err(ReserveError::RedemptionAmountTooSmall)
}

fn get_request_id(request: &RedemptionRequest) -> u64 {
    // In a real implementation, we'd store the request ID
    // For now, we'll use the request time as a proxy
    request.request_time
}

fn get_daily_redemption_total(env: Env) -> Result<u128, ReserveError> {
    let now = env.ledger().timestamp();
    let start_of_day = now - (now % (24 * 60 * 60));

    let requests = env
        .storage()
        .instance()
        .get(&REDEMPTION_REQUESTS)
        .ok_or(ReserveError::RedemptionAmountTooSmall)?;

    let mut daily_total = 0u128;
    for request in requests.iter() {
        if request.request_time >= start_of_day && request.status == RedemptionStatus::Processed {
            daily_total += request.amount;
        }
    }

    Ok(daily_total)
}

fn get_redemption_config(env: Env) -> Result<RedemptionConfig, ReserveError> {
    env.storage()
        .instance()
        .get(&symbol_short!("redemption_config"))
        .ok_or_else(|| {
            Ok(RedemptionConfig {
                large_holder_threshold: LARGE_HOLDER_THRESHOLD,
                processing_delay: 24 * 60 * 60, // 24 hours
                max_daily_redemption: 10_000_000_000_000u128, // $10M daily limit
                emergency_pause: false,
            })
        })
}
