use soroban_sdk::{contracterror, token, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FeeError {
    InsufficientBalance = 1001,
    InvalidAmount = 1002,
}

pub struct FeeManager;

impl FeeManager {
    /// Collects a fee from a payer to a destination - OPTIMIZED
    ///
    /// # Arguments
    /// * `env` - The environment
    /// * `token` - The token contract address to pay fees in
    /// * `payer` - The address paying the fee
    /// * `destination` - The address receiving the fee
    /// * `amount` - The amount of fee to pay
    ///
    /// # Returns
    /// * `Result<(), FeeError>` - Ok if successful, Error otherwise
    pub fn collect_fee(
        env: &Env,
        token: &Address,
        payer: &Address,
        destination: &Address,
        amount: i128,
    ) -> Result<(), FeeError> {
        // Fast-fail validation
        if amount < 0 {
            return Err(FeeError::InvalidAmount);
        }

        if amount == 0 {
            return Ok(());
        }

        let token_client = token::Client::new(env, token);

        // OPTIMIZATION: Remove redundant balance check
        // The transfer will fail if insufficient balance, no need to check twice
        // This saves one contract call
        token_client.transfer(payer, destination, &amount);

        Ok(())
    }

    /// Collects a fee with balance validation - use when you need explicit error handling
    pub fn collect_fee_checked(
        env: &Env,
        token: &Address,
        payer: &Address,
        destination: &Address,
        amount: i128,
    ) -> Result<(), FeeError> {
        if amount < 0 {
            return Err(FeeError::InvalidAmount);
        }

        if amount == 0 {
            return Ok(());
        }

        let token_client = token::Client::new(env, token);

        // Check balance only when explicit error handling is needed
        let balance = token_client.balance(payer);
        if balance < amount {
            return Err(FeeError::InsufficientBalance);
        }

        token_client.transfer(payer, destination, &amount);

        Ok(())
    }
}
