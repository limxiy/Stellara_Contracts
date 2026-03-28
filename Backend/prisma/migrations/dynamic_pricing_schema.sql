-- Dynamic Pricing Module Database Schema
-- This file contains the database migrations for fee tracking and analytics

-- Create fee configuration table
CREATE TABLE IF NOT EXISTS fee_configurations (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL UNIQUE,
    base_maker_fee DECIMAL(10, 8) NOT NULL DEFAULT 0.001,
    base_taker_fee DECIMAL(10, 8) NOT NULL DEFAULT 0.002,
    volatility_multiplier DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
    min_fee DECIMAL(10, 8) NOT NULL DEFAULT 0.0001,
    max_fee DECIMAL(10, 8) NOT NULL DEFAULT 0.005,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create volume tiers table
CREATE TABLE IF NOT EXISTS volume_tiers (
    id SERIAL PRIMARY KEY,
    fee_config_id INTEGER REFERENCES fee_configurations(id) ON DELETE CASCADE,
    min_volume BIGINT NOT NULL,
    max_volume BIGINT,
    maker_fee DECIMAL(10, 8) NOT NULL,
    taker_fee DECIMAL(10, 8) NOT NULL,
    discount_percentage DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user trading profiles table
CREATE TABLE IF NOT EXISTS user_trading_profiles (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    total_volume_30d BIGINT NOT NULL DEFAULT 0,
    trade_count_30d INTEGER NOT NULL DEFAULT 0,
    avg_trade_size BIGINT NOT NULL DEFAULT 0,
    maker_ratio DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
    revenue_generated_30d BIGINT NOT NULL DEFAULT 0,
    user_segment VARCHAR(50) NOT NULL DEFAULT 'RETAIL',
    loyalty_score INTEGER NOT NULL DEFAULT 0,
    ab_test_group VARCHAR(50) NOT NULL DEFAULT 'CONTROL',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create fee calculations log table
CREATE TABLE IF NOT EXISTS fee_calculations_log (
    id SERIAL PRIMARY KEY,
    trade_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    fee_type VARCHAR(50) NOT NULL,
    trade_amount BIGINT NOT NULL,
    base_fee DECIMAL(10, 8) NOT NULL,
    volume_discount DECIMAL(5, 2) NOT NULL DEFAULT 0,
    volatility_adjustment DECIMAL(5, 2) NOT NULL DEFAULT 0,
    segment_discount DECIMAL(5, 2) NOT NULL DEFAULT 0,
    ab_test_adjustment DECIMAL(5, 2) NOT NULL DEFAULT 0,
    competitor_adjustment DECIMAL(5, 2) NOT NULL DEFAULT 0,
    final_fee_rate DECIMAL(10, 8) NOT NULL,
    final_fee_amount BIGINT NOT NULL,
    metadata JSONB,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create market volatility table
CREATE TABLE IF NOT EXISTS market_volatility (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    hourly_change DECIMAL(10, 6) NOT NULL,
    daily_change DECIMAL(10, 6) NOT NULL,
    weekly_change DECIMAL(10, 6) NOT NULL,
    volatility_index INTEGER NOT NULL,
    volatility_level VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create competitor fees table
CREATE TABLE IF NOT EXISTS competitor_fees (
    id SERIAL PRIMARY KEY,
    exchange_name VARCHAR(100) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    maker_fee DECIMAL(10, 8) NOT NULL,
    taker_fee DECIMAL(10, 8) NOT NULL,
    source VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create A/B tests table
CREATE TABLE IF NOT EXISTS ab_tests (
    id SERIAL PRIMARY KEY,
    test_name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    assignment_ratio INTEGER[] NOT NULL,
    control_fee_multiplier DECIMAL(5, 4) NOT NULL,
    variant_a_fee_multiplier DECIMAL(5, 4) NOT NULL,
    variant_b_fee_multiplier DECIMAL(5, 4) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create A/B test assignments table
CREATE TABLE IF NOT EXISTS ab_test_assignments (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES ab_tests(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    assigned_group VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, user_id)
);

-- Create A/B test metrics table
CREATE TABLE IF NOT EXISTS ab_test_metrics (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES ab_tests(id) ON DELETE CASCADE,
    test_group VARCHAR(50) NOT NULL,
    user_count INTEGER NOT NULL DEFAULT 0,
    trade_count INTEGER NOT NULL DEFAULT 0,
    total_volume BIGINT NOT NULL DEFAULT 0,
    total_revenue BIGINT NOT NULL DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_trading_profiles_user_id ON user_trading_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_fee_calculations_log_trade_id ON fee_calculations_log(trade_id);
CREATE INDEX IF NOT EXISTS idx_fee_calculations_log_user_id ON fee_calculations_log(user_id);
CREATE INDEX IF NOT EXISTS idx_fee_calculations_log_symbol ON fee_calculations_log(symbol);
CREATE INDEX IF NOT EXISTS idx_fee_calculations_log_calculated_at ON fee_calculations_log(calculated_at);
CREATE INDEX IF NOT EXISTS idx_market_volatility_symbol ON market_volatility(symbol);
CREATE INDEX IF NOT EXISTS idx_market_volatility_timestamp ON market_volatility(timestamp);
CREATE INDEX IF NOT EXISTS idx_competitor_fees_symbol ON competitor_fees(symbol);
CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_user_id ON ab_test_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_metrics_test_id ON ab_test_metrics(test_id);

-- Create function to update user trading profile
CREATE OR REPLACE FUNCTION update_user_trading_profile()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_trading_profiles
    SET 
        total_volume_30d = GREATEST(total_volume_30d, NEW.trade_amount),
        trade_count_30d = trade_count_30d + 1,
        last_updated = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic profile updates
CREATE TRIGGER trg_update_user_profile_after_trade
AFTER INSERT ON fee_calculations_log
FOR EACH ROW
EXECUTE FUNCTION update_user_trading_profile();

-- Create view for fee analytics dashboard
CREATE OR REPLACE VIEW fee_analytics_summary AS
SELECT 
    DATE_TRUNC('day', calculated_at) AS date,
    symbol,
    fee_type,
    COUNT(*) AS trade_count,
    SUM(trade_amount) AS total_volume,
    SUM(final_fee_amount) AS total_fees,
    AVG(final_fee_rate) AS avg_fee_rate,
    AVG(volume_discount) AS avg_volume_discount,
    AVG(volatility_adjustment) AS avg_volatility_adjustment
FROM fee_calculations_log
GROUP BY DATE_TRUNC('day', calculated_at), symbol, fee_type
ORDER BY date DESC;

-- Create view for revenue by user segment
CREATE OR REPLACE VIEW revenue_by_segment AS
SELECT 
    utp.user_segment,
    COUNT(fcl.id) AS trade_count,
    SUM(fcl.final_fee_amount) AS total_revenue,
    AVG(fcl.final_fee_rate) AS avg_fee_rate
FROM fee_calculations_log fcl
JOIN user_trading_profiles utp ON fcl.user_id = utp.user_id
GROUP BY utp.user_segment
ORDER BY total_revenue DESC;
