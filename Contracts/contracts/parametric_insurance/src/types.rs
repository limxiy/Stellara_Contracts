//! Core data types for the Parametric Insurance Protocol

use soroban_sdk::{contracttype, Address, Symbol, Vec};

/// Category of risk the policy covers
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum PolicyType {
    /// Weather events (rainfall, temperature, wind speed)
    Weather = 0,
    /// Commercial flight delays or cancellations
    FlightDelay = 1,
    /// Natural disasters (earthquake, flood, hurricane)
    NaturalDisaster = 2,
    /// Agricultural / crop failure
    Crop = 3,
    /// Any other oracle-driven risk
    Custom = 4,
}

/// How the live oracle value is compared against the trigger threshold
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum TriggerCondition {
    /// Payout when oracle_value  >  threshold (e.g. rainfall > 200 mm)
    GreaterThan = 0,
    /// Payout when oracle_value  <  threshold (e.g. temperature < -10 °C)
    LessThan = 1,
    /// Payout when oracle_value  >= threshold
    GreaterOrEqual = 2,
    /// Payout when oracle_value  <= threshold
    LessOrEqual = 3,
    /// Payout when oracle_value  == threshold (e.g. specific flight status code)
    EqualTo = 4,
}

/// Lifecycle state of a policy
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum PolicyStatus {
    /// Coverage period is ongoing; eligible for trigger checks
    Active = 0,
    /// Coverage period ended without a qualifying event
    Expired = 1,
    /// Trigger was met and payout was executed
    Claimed = 2,
    /// Cancelled by the policyholder before a trigger
    Cancelled = 3,
}

/// An individual parametric insurance policy
#[contracttype]
#[derive(Clone, Debug)]
pub struct InsurancePolicy {
    /// Unique policy identifier (auto-incremented)
    pub id: u64,
    /// Address of the insured party
    pub policyholder: Address,
    /// Risk category
    pub policy_type: PolicyType,
    /// Payout amount in pool_token units (released on trigger)
    pub coverage_amount: i128,
    /// Premium paid upfront in pool_token units
    pub premium_amount: i128,
    /// Oracle feed key to monitor (e.g. Symbol::new("RAINFALL_NYC"))
    pub oracle_feed: Symbol,
    /// The threshold value the oracle reading is compared against
    pub trigger_threshold: i128,
    /// Comparison operator applied between oracle value and threshold
    pub trigger_condition: TriggerCondition,
    /// Unix timestamp when coverage begins
    pub start_time: u64,
    /// Unix timestamp when coverage expires
    pub end_time: u64,
    /// Current lifecycle state
    pub status: PolicyStatus,
    /// Ledger timestamp when the policy was created
    pub created_at: u64,
}

/// Aggregate statistics and accounting for the shared risk pool
#[contracttype]
#[derive(Clone, Debug)]
pub struct RiskPool {
    /// All tokens currently held by the contract
    /// (LP deposits + premiums − payouts − LP withdrawals)
    pub total_liquidity: i128,
    /// Sum of coverage_amounts for all Active policies (cannot be withdrawn)
    pub reserved_liquidity: i128,
    /// Cumulative premium income received
    pub total_premiums_collected: i128,
    /// Cumulative payouts disbursed
    pub total_payouts: i128,
    /// All-time number of policies created
    pub total_policies: u64,
    /// Number of currently Active policies
    pub active_policies: u64,
}

impl RiskPool {
    pub fn new() -> Self {
        Self {
            total_liquidity: 0,
            reserved_liquidity: 0,
            total_premiums_collected: 0,
            total_payouts: 0,
            total_policies: 0,
            active_policies: 0,
        }
    }

    /// Tokens available for new policy reservations or LP withdrawals
    pub fn available_liquidity(&self) -> i128 {
        self.total_liquidity.saturating_sub(self.reserved_liquidity)
    }
}

/// Oracle configuration stored in contract instance storage
#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleConfig {
    /// Registered oracle contract addresses queried for each trigger check
    pub sources: Vec<Address>,
    /// Maximum age (seconds) of an oracle sample; 0 disables staleness check
    pub max_staleness: u64,
    /// Minimum number of agreeing oracle sources required
    pub min_sources: u32,
}
