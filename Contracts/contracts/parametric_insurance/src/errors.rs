//! Error codes for the Parametric Insurance Protocol
//!
//! Range: 6001 – 6099  (reserved for parametric_insurance module)

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum InsuranceError {
    // ── Auth ──────────────────────────────────────────────────────────────────
    /// Caller is not the contract admin
    Unauthorized = 6001,
    /// Contract is paused; no state-changing operations are allowed
    ContractPaused = 6002,

    // ── Initialization ────────────────────────────────────────────────────────
    /// Contract has not been initialized yet
    NotInitialized = 6003,
    /// Contract has already been initialized
    AlreadyInitialized = 6004,

    // ── Policy lifecycle ──────────────────────────────────────────────────────
    /// No policy exists with the given ID
    PolicyNotFound = 6005,
    /// Policy is not in Active state (already expired, claimed, or cancelled)
    PolicyNotActive = 6006,
    /// Policy coverage window has elapsed
    PolicyExpired = 6007,
    /// Oracle value does not satisfy the trigger condition
    TriggerNotMet = 6008,
    /// Policy has already been paid out
    AlreadyClaimed = 6009,
    /// Policy was previously cancelled
    PolicyAlreadyCancelled = 6010,

    // ── Risk pool ─────────────────────────────────────────────────────────────
    /// Pool does not hold enough unreserved liquidity for this coverage
    InsufficientPoolLiquidity = 6011,
    /// LP is attempting to withdraw more than their recorded deposit
    InsufficientLPBalance = 6012,
    /// Withdrawal exceeds currently available (unreserved) pool liquidity
    WithdrawalExceedsAvailable = 6013,

    // ── Input validation ──────────────────────────────────────────────────────
    /// Amount must be positive
    InvalidAmount = 6014,
    /// Duration must be positive
    InvalidDuration = 6015,
    /// Coverage amount cannot exceed pool's available liquidity
    CoverageExceedsAvailable = 6016,

    // ── Oracle ────────────────────────────────────────────────────────────────
    /// Oracle query failed (stale, insufficient sources, or call error)
    OracleFailure = 6017,
}
