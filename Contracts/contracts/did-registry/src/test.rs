use soroban_sdk::symbol_short;
use soroban_sdk::testutils::{Address as TestAddress, Ledger as TestLedger};
use soroban_sdk::{Env, Address, Bytes, Vec, Symbol};

use did_registry::{DIDRegistryContract, DIDRegistryError, VerificationMethod, Service};

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DIDRegistryContract);
    let client = DIDRegistryContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    client.initialize(&admin, &approvers, &executor);
    
    // Verify initial state
    assert_eq!(client.get_did_count(), 0);
}

#[test]
fn test_create_stellar_did() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DIDRegistryContract);
    let client = DIDRegistryContractClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    client.initialize(&admin, &approvers, &executor);

    // Create DID
    let stellar_address = Address::generate(&env);
    
    let mut verification_methods = Vec::new(&env);
    let vm = VerificationMethod {
        id: symbol_short!("key-1"),
        type_: symbol_short!("Ed25519VerificationKey2018"),
        controller: symbol_short!("did:stellar:test"),
        public_key: Bytes::from_slice(&env, b"test_public_key"),
        created_at: env.ledger().timestamp(),
    };
    verification_methods.push_back(vm);

    let services = Vec::new(&env);

    let did_id = client.create_stellar_did(&stellar_address, &verification_methods, &services);
    
    // Verify DID was created
    assert_eq!(client.get_did_count(), 1);
    
    let document = client.resolve_did(&did_id);
    assert_eq!(document.id, did_id);
    assert_eq!(document.verification_methods.len(), 1);
    assert_eq!(document.deactivated, false);
}

#[test]
fn test_create_key_did() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DIDRegistryContract);
    let client = DIDRegistryContractClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    client.initialize(&admin, &approvers, &executor);

    // Create DID
    let public_key = Bytes::from_slice(&env, b"z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2do7");
    
    let mut verification_methods = Vec::new(&env);
    let vm = VerificationMethod {
        id: symbol_short!("key-1"),
        type_: symbol_short!("Ed25519VerificationKey2018"),
        controller: symbol_short!("did:key:test"),
        public_key: public_key.clone(),
        created_at: env.ledger().timestamp(),
    };
    verification_methods.push_back(vm);

    let services = Vec::new(&env);

    let did_id = client.create_key_did(&public_key, &verification_methods, &services);
    
    // Verify DID was created
    assert_eq!(client.get_did_count(), 1);
    
    let document = client.resolve_did(&did_id);
    assert_eq!(document.id, did_id);
    assert_eq!(document.verification_methods.len(), 1);
    assert_eq!(document.deactivated, false);
}

#[test]
fn test_add_verification_method() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DIDRegistryContract);
    let client = DIDRegistryContractClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    client.initialize(&admin, &approvers, &executor);

    // Create initial DID
    let stellar_address = Address::generate(&env);
    let verification_methods = Vec::new(&env);
    let services = Vec::new(&env);

    let did_id = client.create_stellar_did(&stellar_address, &verification_methods, &services);
    
    // Add verification method
    let new_vm = VerificationMethod {
        id: symbol_short!("key-2"),
        type_: symbol_short!("Ed25519VerificationKey2018"),
        controller: symbol_short!("did:stellar:test"),
        public_key: Bytes::from_slice(&env, b"new_public_key"),
        created_at: env.ledger().timestamp(),
    };

    client.add_verification_method(&did_id, &new_vm);
    
    // Verify
    let document = client.resolve_did(&did_id);
    assert_eq!(document.verification_methods.len(), 1);
    assert_eq!(document.authentication.len(), 1);
}

#[test]
fn test_add_service() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DIDRegistryContract);
    let client = DIDRegistryContractClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    client.initialize(&admin, &approvers, &executor);

    // Create initial DID
    let stellar_address = Address::generate(&env);
    let verification_methods = Vec::new(&env);
    let services = Vec::new(&env);

    let did_id = client.create_stellar_did(&stellar_address, &verification_methods, &services);
    
    // Add service
    let service = Service {
        id: symbol_short!("hub-1"),
        type_: symbol_short!("IdentityHub"),
        service_endpoint: symbol_short!("https://hub.example.com"),
        created_at: env.ledger().timestamp(),
    };

    client.add_service(&did_id, &service);
    
    // Verify
    let document = client.resolve_did(&did_id);
    assert_eq!(document.service.len(), 1);
    assert_eq!(document.service.get(0).unwrap().id, symbol_short!("hub-1"));
}

#[test]
fn test_deactivate_did() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DIDRegistryContract);
    let client = DIDRegistryContractClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    client.initialize(&admin, &approvers, &executor);

    // Create DID
    let stellar_address = Address::generate(&env);
    let verification_methods = Vec::new(&env);
    let services = Vec::new(&env);

    let did_id = client.create_stellar_did(&stellar_address, &verification_methods, &services);
    
    // Deactivate DID
    client.deactivate_did(&did_id);
    
    // Verify
    let document = client.resolve_did(&did_id);
    assert_eq!(document.deactivated, true);
}
