#![cfg(test)]

use crate::vesting::{AcademyVestingContract, AcademyVestingContractClient};
use shared::circuit_breaker::CircuitBreakerConfig;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

extern crate std;
use std::println;

fn default_cb_config() -> CircuitBreakerConfig {
    CircuitBreakerConfig {
        max_volume_per_period: 1_000_000_000i128,
        max_tx_count_per_period: 100u64,
        period_duration: 3600u64,
    }
}

fn setup_claim_env(
    env: &Env,
) -> (
    AcademyVestingContractClient<'_>,
    Address,
    Address,
    StellarAssetClient<'static>,
) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let beneficiary = Address::generate(env);
    let governance = Address::generate(env);
    let reward_token = env.register_stellar_asset_contract(admin.clone());
    let reward_admin = StellarAssetClient::new(env, &reward_token);

    let contract_id = env.register_contract(None, AcademyVestingContract);
    let client = AcademyVestingContractClient::new(env, &contract_id);
    let cb_config = default_cb_config();
    client.init(&admin, &reward_token, &governance, &cb_config);

    for amount in [500i128, 750i128, 900i128] {
        client.grant_vesting(&admin, &beneficiary, &amount, &0, &0, &10);
    }

    reward_admin.mint(&contract_id, &5_000);
    env.ledger().with_mut(|li| li.timestamp = 20);

    (client, admin, beneficiary, reward_admin)
}

#[test]
fn test_batch_claim_gas_efficiency() {
    let env = Env::default();
    let (client, _admin, beneficiary, _reward_admin) = setup_claim_env(&env);

    env.budget().reset_default();
    let _ = client.claim(&1u64, &beneficiary);
    let claim_one_cpu = env.budget().cpu_instruction_cost();

    env.budget().reset_default();
    let _ = client.claim(&2u64, &beneficiary);
    let claim_two_cpu = env.budget().cpu_instruction_cost();

    env.budget().reset_default();
    let _ = client.claim(&3u64, &beneficiary);
    let claim_three_cpu = env.budget().cpu_instruction_cost();

    let individual_total = claim_one_cpu + claim_two_cpu + claim_three_cpu;

    let batch_env = Env::default();
    let (batch_client, _batch_admin, batch_beneficiary, _batch_reward_admin) =
        setup_claim_env(&batch_env);

    batch_env.budget().reset_default();
    let batch_claimed = batch_client.batch_claim(
        &soroban_sdk::vec![&batch_env, 1u64, 2u64, 3u64],
        &batch_beneficiary,
    );
    let batch_cpu = batch_env.budget().cpu_instruction_cost();

    println!("Academy batch-claim CPU: {}", batch_cpu);
    println!("Academy 3 individual claims CPU: {}", individual_total);

    assert_eq!(batch_claimed, 2_150);
    assert!(
        batch_cpu < individual_total,
        "batch claim should use less CPU"
    );
}
