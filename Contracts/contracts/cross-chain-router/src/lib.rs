#![no_std]
pub mod bridge;
use soroban_sdk::{contract, contractimpl, contracttype, Env, Symbol, Vec, BytesN, Address, Bytes};

#[contract]
pub struct CrossChainRouter;

#[contracttype]
#[derive(Clone)]
pub struct Message {
    pub id: BytesN<32>,
    pub source_chain: u32,
    pub dest_chain: u32,
    pub sender: Address,
    pub recipient: Address,
    pub payload: Bytes,
    pub nonce: u64,
    pub status: u32, // 0=INITIATED, 1=LOCKED, 2=VERIFIED, 3=RELEASED
}

#[contracttype]
#[derive(Clone)]
pub struct Validator {
    pub address: Address,
    pub staked_amount: i128,
    pub status: u32, // 0=ACTIVE, 1=INACTIVE, 2=SLASHED
}

#[contracttype]
#[derive(Clone)]
pub struct LightClientHeader {
    pub block_number: u64,
    pub block_hash: BytesN<32>,
    pub timestamp: u64,
    pub commitment_root: BytesN<32>,
}

#[contractimpl]
impl CrossChainRouter {
    /// Initialize a new cross-chain message
    pub fn initiate_message(
        env: Env,
        source_chain: u32,
        dest_chain: u32,
        sender: Address,
        recipient: Address,
        payload: Bytes,
    ) -> BytesN<32> {
        sender.require_auth();

        let message_id = env.crypto().sha256(&payload);
        let nonce = env.ledger().sequence();

        let message = Message {
            id: message_id.clone(),
            source_chain,
            dest_chain,
            sender: sender.clone(),
            recipient,
            payload,
            nonce: nonce as u64,
            status: 0, // INITIATED
        };

        // Store message
        let mut messages: Vec<Message> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "messages"))
            .unwrap_or(Vec::new(&env));

        messages.push_back(message);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "messages"), &messages);

        env.events()
            .publish((Symbol::new(&env, "message_initiated"),), message_id.clone());

        message_id
    }

    /// Verify a cross-chain message through light client proofs
    pub fn verify_message(
        env: Env,
        message_id: BytesN<32>,
        _header: LightClientHeader,
        proof: Bytes,
    ) -> bool {
        // Get light client data for destination chain
        let light_client: LightClientHeader = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "light_client"))
            .unwrap();

        // Verify header proof (simplified BFT verification)
        let expected_hash = env.crypto().sha256(&proof);

        // In production, would verify:
        // 1. 2/3+ validator signatures on the header
        // 2. Merkle proofs for state inclusion
        // 3. Finality confirmation

        let is_valid = expected_hash == light_client.commitment_root;

        if is_valid {
            // Update message status to VERIFIED
            let mut messages: Vec<Message> = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, "messages"))
                .unwrap();

            for i in 0..messages.len() {
                let mut msg = messages.get_unchecked(i);
                if msg.id == message_id {
                    msg.status = 2; // VERIFIED
                    messages.set(i, msg);
                    break;
                }
            }

            env.storage()
                .persistent()
                .set(&Symbol::new(&env, "messages"), &messages);

            env.events()
                .publish((Symbol::new(&env, "message_verified"),), message_id);
        }

        is_valid
    }

    /// Register a validator (called once per chain)
    pub fn register_validator(
        env: Env,
        validator_address: Address,
        staked_amount: i128,
    ) -> bool {
        validator_address.require_auth();

        // Validate minimum stake
        if staked_amount < 1_000_000_000 {
            return false;
        }

        let validator = Validator {
            address: validator_address.clone(),
            staked_amount,
            status: 0, // ACTIVE
        };

        let mut validators: Vec<Validator> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "validators"))
            .unwrap_or(Vec::new(&env));

        validators.push_back(validator);
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "validators"), &validators);

        true
    }

    /// Slash a validator for misbehavior
    pub fn slash_validator(
        env: Env,
        validator_address: Address,
        slash_percentage: u64,
    ) -> i128 {
        // Only admin can slash
        let admin: Address = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();

        admin.require_auth();

        let mut validators: Vec<Validator> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "validators"))
            .unwrap_or(Vec::new(&env));

        let mut slash_amount: i128 = 0;

        for i in 0..validators.len() {
            let mut validator = validators.get_unchecked(i);
            if validator.address == validator_address {
                slash_amount = (validator.staked_amount * slash_percentage as i128) / 100;
                validator.staked_amount -= slash_amount;

                if validator.staked_amount <= 0 {
                    validator.status = 2; // SLASHED
                }

                validators.set(i, validator);
                break;
            }
        }

        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "validators"), &validators);

        env.events()
            .publish((Symbol::new(&env, "validator_slashed"),), validator_address);

        slash_amount
    }

    /// Get message status
    pub fn get_message_status(env: Env, message_id: BytesN<32>) -> u32 {
        let messages: Vec<Message> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "messages"))
            .unwrap_or(Vec::new(&env));

        for message in messages.iter() {
            if message.id == message_id {
                return message.status;
            }
        }

        u32::MAX // Not found
    }

    /// Update light client header (called by relayers)
    pub fn update_light_client(env: Env, header: LightClientHeader) -> bool {
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "light_client"), &header);

        true
    }

    /// Get active validator count
    pub fn get_validator_count(env: Env) -> u32 {
        let validators: Vec<Validator> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "validators"))
            .unwrap_or(Vec::new(&env));

        let count = validators
            .iter()
            .filter(|v| v.status == 0) // Only ACTIVE
            .count();

        count as u32
    }

    /// Initialize router with admin
    pub fn init(env: Env, admin: Address) {
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "admin"), &admin);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, testutils::Address as _, Address};

    #[test]
    fn test_initiate_message() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CrossChainRouter);
        let client = CrossChainRouterClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let payload = Bytes::from_array(&env, &[1, 2, 3]);

        client.initiate_message(&0, &1, &sender, &recipient, &payload);
    }

    #[test]
    fn test_bridge_deposit() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, bridge::StellaraBridge);
        let client = bridge::StellaraBridgeClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fee_collector = Address::generate(&env);
        client.initialize(&admin, &fee_collector, &1, &1);

        let from = Address::generate(&env);
        let asset = Address::generate(&env);
        let amount = 1000i128;
        let dest_chain = 2u32;
        let recipient = Address::generate(&env);

        client.deposit(&from, &asset, &amount, &dest_chain, &recipient);
    }
}
