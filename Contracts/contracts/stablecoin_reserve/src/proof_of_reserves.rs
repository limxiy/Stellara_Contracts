use crate::{ReserveAsset, ReserveError};
use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, Map, Symbol, Vec};

const MERKLE_TREES: Symbol = symbol_short!("merkle_trees");
const PROOF_GENERATION_TIME: Symbol = symbol_short!("proof_time");

pub struct MerkleProof {
    pub leaf: BytesN<32>,
    pub proof: Vec<BytesN<32>>,
    pub leaf_index: u32,
    pub root: BytesN<32>,
}

pub fn generate_daily_proof(env: Env) -> Result<BytesN<32>, ReserveError> {
    let now = env.ledger().timestamp();

    // Check if proof was already generated today
    if let Some(last_generation) = env.storage().instance().get(&PROOF_GENERATION_TIME) {
        let days_since_last = (now - last_generation) / (24 * 60 * 60);
        if days_since_last == 0 {
            return Err(ReserveError::InvalidMerkleProof);
        }
    }

    // Get current reserve assets
    let assets = env
        .storage()
        .instance()
        .get(&symbol_short!("reserve_assets"))
        .ok_or(ReserveError::InvalidAsset)?;

    // Generate Merkle tree from all holders and their balances
    let holder_balances = get_all_holder_balances(env.clone())?;
    let merkle_root = generate_merkle_tree(env.clone(), &holder_balances)?;

    // Store the Merkle tree data
    env.storage().instance().set(&MERKLE_TREES, &merkle_root);
    env.storage().instance().set(&PROOF_GENERATION_TIME, &now);

    // Log proof generation
    env.events().publish(
        (symbol_short!("proof"), symbol_short!("generated")),
        (merkle_root, now, holder_balances.len()),
    );

    Ok(merkle_root)
}

pub fn verify_inclusion(
    env: Env,
    user: Address,
    amount: u128,
    proof: Vec<BytesN<32>>,
    leaf_index: u32,
) -> Result<bool, ReserveError> {
    // Get current Merkle root
    let current_root = env
        .storage()
        .instance()
        .get(&MERKLE_TREES)
        .ok_or(ReserveError::InvalidMerkleProof)?;

    // Generate leaf hash for user
    let leaf_data = (user, amount);
    let leaf_hash = env.crypto().keccak256(&leaf_data.to_xdr());

    // Verify Merkle proof
    let computed_root = verify_merkle_proof(env.clone(), leaf_hash, proof, leaf_index)?;

    Ok(computed_root == current_root)
}

fn get_all_holder_balances(env: Env) -> Result<Vec<(Address, u128)>, ReserveError> {
    // In a real implementation, this would query the stablecoin contract
    // for all holder balances. For now, we'll return a simplified version.

    let stablecoin_address = env
        .storage()
        .instance()
        .get(&symbol_short!("stablecoin"))
        .ok_or(ReserveError::InvalidAsset)?;

    // This would typically involve querying the token contract
    // For demonstration, we'll return empty data
    Ok(Vec::new(&env))
}

fn generate_merkle_tree(
    env: Env,
    holder_balances: &Vec<(Address, u128)>,
) -> Result<BytesN<32>, ReserveError> {
    if holder_balances.is_empty() {
        return Ok(BytesN::from_array(&env, &[0u8; 32]));
    }

    // Generate leaf nodes
    let mut leaves: Vec<BytesN<32>> = Vec::new(&env);
    for (holder, balance) in holder_balances {
        let leaf_data = (*holder, *balance);
        let leaf_hash = env.crypto().keccak256(&leaf_data.to_xdr());
        leaves.push_back(BytesN::from_array(&env, &leaf_hash));
    }

    // Build Merkle tree
    let mut current_level = leaves;
    while current_level.len() > 1 {
        let mut next_level: Vec<BytesN<32>> = Vec::new(&env);

        for i in (0..current_level.len()).step_by(2) {
            let left = current_level.get(i).unwrap();
            let right = if i + 1 < current_level.len() {
                current_level.get(i + 1).unwrap()
            } else {
                left // Duplicate last element if odd number
            };

            let combined = [left.to_array(), right.to_array()].concat();
            let parent_hash = env.crypto().keccak256(&combined);
            next_level.push_back(BytesN::from_array(&env, &parent_hash));
        }

        current_level = next_level;
    }

    Ok(current_level.get(0).unwrap())
}

fn verify_merkle_proof(
    env: Env,
    leaf: [u8; 32],
    proof: Vec<BytesN<32>>,
    leaf_index: u32,
) -> Result<BytesN<32>, ReserveError> {
    let mut computed_hash = leaf;
    let mut index = leaf_index;

    for proof_element in proof.iter() {
        if index % 2 == 0 {
            // Current node is left child
            let combined = [computed_hash, proof_element.to_array()].concat();
            computed_hash = env.crypto().keccak256(&combined);
        } else {
            // Current node is right child
            let combined = [proof_element.to_array(), computed_hash].concat();
            computed_hash = env.crypto().keccak256(&combined);
        }

        index = index / 2;
    }

    Ok(BytesN::from_array(&env, &computed_hash))
}

pub fn generate_user_proof(
    env: Env,
    user: Address,
    amount: u128,
) -> Result<MerkleProof, ReserveError> {
    let holder_balances = get_all_holder_balances(env.clone())?;

    // Find user's position in the list
    let mut leaf_index = None;
    for (i, (holder, balance)) in holder_balances.iter().enumerate() {
        if *holder == user && *balance == amount {
            leaf_index = Some(i as u32);
            break;
        }
    }

    let leaf_index = leaf_index.ok_or(ReserveError::InvalidMerkleProof)?;

    // Generate Merkle tree to get proof
    let merkle_root = generate_merkle_tree(env.clone(), &holder_balances)?;
    let proof = generate_proof_for_leaf(env.clone(), &holder_balances, leaf_index)?;

    // Generate leaf hash
    let leaf_data = (user, amount);
    let leaf_hash = env.crypto().keccak256(&leaf_data.to_xdr());

    Ok(MerkleProof {
        leaf: BytesN::from_array(&env, &leaf_hash),
        proof,
        leaf_index,
        root: merkle_root,
    })
}

fn generate_proof_for_leaf(
    env: Env,
    holder_balances: &Vec<(Address, u128)>,
    leaf_index: u32,
) -> Result<Vec<BytesN<32>>, ReserveError> {
    // Generate leaf nodes
    let mut leaves: Vec<BytesN<32>> = Vec::new(&env);
    for (holder, balance) in holder_balances {
        let leaf_data = (*holder, *balance);
        let leaf_hash = env.crypto().keccak256(&leaf_data.to_xdr());
        leaves.push_back(BytesN::from_array(&env, &leaf_hash));
    }

    // Build Merkle tree and collect proof elements
    let mut current_level = leaves;
    let mut proof: Vec<BytesN<32>> = Vec::new(&env);
    let mut index = leaf_index;

    while current_level.len() > 1 {
        if index % 2 == 0 {
            // Current node is left child, add right sibling to proof
            if index + 1 < current_level.len() as u32 {
                proof.push_back(current_level.get((index + 1) as usize).unwrap());
            }
        } else {
            // Current node is right child, add left sibling to proof
            proof.push_back(current_level.get((index - 1) as usize).unwrap());
        }

        // Build next level
        let mut next_level: Vec<BytesN<32>> = Vec::new(&env);
        for i in (0..current_level.len()).step_by(2) {
            let left = current_level.get(i).unwrap();
            let right = if i + 1 < current_level.len() {
                current_level.get(i + 1).unwrap()
            } else {
                left
            };

            let combined = [left.to_array(), right.to_array()].concat();
            let parent_hash = env.crypto().keccak256(&combined);
            next_level.push_back(BytesN::from_array(&env, &parent_hash));
        }

        current_level = next_level;
        index = index / 2;
    }

    Ok(proof)
}
