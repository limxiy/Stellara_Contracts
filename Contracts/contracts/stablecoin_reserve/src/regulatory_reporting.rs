use crate::{AssetType, ReserveAsset, ReserveError, ReserveSnapshot};
use soroban_sdk::{contracttype, symbol_short, Address, Env, Map, Symbol, Vec};

const REPORTING_HISTORY: Symbol = symbol_short!("report_history");
const LAST_MONTHLY_REPORT: Symbol = symbol_short!("last_monthly");
const LAST_DAILY_REPORT: Symbol = symbol_short!("last_daily");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegulatoryReport {
    pub timestamp: u64,
    pub report_type: ReportType,
    pub total_reserves: u128,
    pub total_supply: u128,
    pub reserve_ratio: u64,
    pub asset_breakdown: Vec<AssetBreakdown>,
    pub compliance_status: ComplianceStatus,
    pub custodian_verifications: Vec<CustodianVerification>,
    pub merkle_root: [u8; 32],
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReportType {
    Daily = 0,
    Monthly = 1,
    Quarterly = 2,
    Annual = 3,
    AdHoc = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetBreakdown {
    pub asset_type: AssetType,
    pub amount: u128,
    pub percentage: u64, // in basis points
    pub custodian: Address,
    pub last_verified: u64,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ComplianceStatus {
    Compliant = 0,
    Warning = 1,
    NonCompliant = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CustodianVerification {
    pub custodian: Address,
    pub verification_time: u64,
    pub verification_hash: [u8; 32],
    pub status: VerificationStatus,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VerificationStatus {
    Verified = 0,
    Pending = 1,
    Failed = 2,
}

pub fn generate_report(env: Env) -> Result<Symbol, ReserveError> {
    let now = env.ledger().timestamp();
    let report_type = determine_report_type(env.clone(), now)?;

    // Get current reserve snapshot
    let snapshot = crate::reserve_tracking::get_current_snapshot(env.clone())?;

    // Generate asset breakdown
    let asset_breakdown = generate_asset_breakdown(env.clone(), &snapshot.assets)?;

    // Check compliance status
    let compliance_status = check_compliance(env.clone(), &snapshot)?;

    // Get custodian verifications
    let custodian_verifications = get_custodian_verifications(env.clone(), &snapshot.assets)?;

    // Create report
    let report = RegulatoryReport {
        timestamp: now,
        report_type,
        total_reserves: snapshot.total_reserves,
        total_supply: snapshot.total_supply,
        reserve_ratio: snapshot.reserve_ratio,
        asset_breakdown,
        compliance_status,
        custodian_verifications,
        merkle_root: snapshot.merkle_root.to_array(),
    };

    // Store report
    store_report(env.clone(), report)?;

    // Update last report timestamp
    match report_type {
        ReportType::Daily => env.storage().instance().set(&LAST_DAILY_REPORT, &now),
        ReportType::Monthly => env.storage().instance().set(&LAST_MONTHLY_REPORT, &now),
        _ => {}
    }

    // Generate report ID
    let report_id = format!("report_{}", now);
    let report_symbol = Symbol::from_str(&env, &report_id);

    // Log report generation
    env.events().publish(
        (symbol_short!("report"), symbol_short!("generated")),
        (report_symbol, report_type, compliance_status),
    );

    Ok(report_symbol)
}

pub fn get_report(env: Env, report_id: Symbol) -> Result<RegulatoryReport, ReserveError> {
    let reports = env
        .storage()
        .instance()
        .get(&REPORTING_HISTORY)
        .ok_or(ReserveError::ReportingError)?;

    for report in reports.iter() {
        let current_id = format!("report_{}", report.timestamp);
        let current_symbol = Symbol::from_str(&env, &current_id);
        if current_symbol == report_id {
            return Ok(report);
        }
    }

    Err(ReserveError::ReportingError)
}

pub fn get_reports_by_type(
    env: Env,
    report_type: ReportType,
) -> Result<Vec<RegulatoryReport>, ReserveError> {
    let reports = env
        .storage()
        .instance()
        .get(&REPORTING_HISTORY)
        .ok_or(ReserveError::ReportingError)?;

    let mut filtered_reports: Vec<RegulatoryReport> = Vec::new(&env);
    for report in reports.iter() {
        if report.report_type == report_type {
            filtered_reports.push_back(report);
        }
    }

    Ok(filtered_reports)
}

pub fn get_compliance_summary(env: Env) -> Result<ComplianceSummary, ReserveError> {
    let snapshot = crate::reserve_tracking::get_current_snapshot(env.clone())?;
    let compliance_status = check_compliance(env.clone(), &snapshot)?;

    let last_daily = env
        .storage()
        .instance()
        .get(&LAST_DAILY_REPORT)
        .unwrap_or(0u64);
    let last_monthly = env
        .storage()
        .instance()
        .get(&LAST_MONTHLY_REPORT)
        .unwrap_or(0u64);

    let now = env.ledger().timestamp();
    let days_since_daily = (now - last_daily) / (24 * 60 * 60);
    let days_since_monthly = (now - last_monthly) / (24 * 60 * 60);

    Ok(ComplianceSummary {
        current_ratio: snapshot.reserve_ratio,
        status: compliance_status,
        days_since_daily_report: days_since_daily,
        days_since_monthly_report: days_since_monthly,
        total_reserves: snapshot.total_reserves,
        total_supply: snapshot.total_supply,
    })
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComplianceSummary {
    pub current_ratio: u64,
    pub status: ComplianceStatus,
    pub days_since_daily_report: u64,
    pub days_since_monthly_report: u64,
    pub total_reserves: u128,
    pub total_supply: u128,
}

fn determine_report_type(env: Env, now: u64) -> Result<ReportType, ReserveError> {
    let last_daily = env
        .storage()
        .instance()
        .get(&LAST_DAILY_REPORT)
        .unwrap_or(0u64);
    let last_monthly = env
        .storage()
        .instance()
        .get(&LAST_MONTHLY_REPORT)
        .unwrap_or(0u64);

    let days_since_daily = (now - last_daily) / (24 * 60 * 60);
    let days_since_monthly = (now - last_monthly) / (24 * 60 * 60);

    // Monthly report (30 days)
    if days_since_monthly >= 30 {
        return Ok(ReportType::Monthly);
    }

    // Daily report (1 day)
    if days_since_daily >= 1 {
        return Ok(ReportType::Daily);
    }

    // If neither is due, generate ad-hoc report
    Ok(ReportType::AdHoc)
}

fn generate_asset_breakdown(
    env: Env,
    assets: &Vec<ReserveAsset>,
) -> Result<Vec<AssetBreakdown>, ReserveError> {
    let total_reserves: u128 = assets.iter().map(|asset| asset.amount).sum();
    if total_reserves == 0 {
        return Ok(Vec::new(&env));
    }

    let mut breakdown: Vec<AssetBreakdown> = Vec::new(&env);

    for asset in assets.iter() {
        let percentage = (asset.amount * 10000) / total_reserves;
        let asset_breakdown = AssetBreakdown {
            asset_type: asset.asset_type,
            amount: asset.amount,
            percentage,
            custodian: asset.custodian,
            last_verified: asset.last_verified,
        };
        breakdown.push_back(asset_breakdown);
    }

    Ok(breakdown)
}

fn check_compliance(
    env: Env,
    snapshot: &ReserveSnapshot,
) -> Result<ComplianceStatus, ReserveError> {
    // Check 1:1 backing requirement
    if snapshot.reserve_ratio < 10000 {
        return Ok(ComplianceStatus::NonCompliant);
    }

    // Check if any asset needs verification (older than 24 hours)
    let now = env.ledger().timestamp();
    for asset in snapshot.assets.iter() {
        if now - asset.last_verified > 24 * 60 * 60 {
            return Ok(ComplianceStatus::Warning);
        }
    }

    Ok(ComplianceStatus::Compliant)
}

fn get_custodian_verifications(
    env: Env,
    assets: &Vec<ReserveAsset>,
) -> Result<Vec<CustodianVerification>, ReserveError> {
    let mut verifications: Vec<CustodianVerification> = Vec::new(&env);

    for asset in assets.iter() {
        let verification = CustodianVerification {
            custodian: asset.custodian,
            verification_time: asset.last_verified,
            verification_hash: asset.verification_hash.to_array(),
            status: VerificationStatus::Verified,
        };
        verifications.push_back(verification);
    }

    Ok(verifications)
}

fn store_report(env: Env, report: RegulatoryReport) -> Result<(), ReserveError> {
    let mut reports = env
        .storage()
        .instance()
        .get(&REPORTING_HISTORY)
        .unwrap_or(Vec::new(&env));

    reports.push_back(report);

    // Keep only last 365 reports
    while reports.len() > 365 {
        reports.pop_front();
    }

    env.storage().instance().set(&REPORTING_HISTORY, &reports);
    Ok(())
}

pub fn export_report_data(env: Env, report_id: Symbol) -> Result<Vec<u8>, ReserveError> {
    let report = get_report(env.clone(), report_id)?;

    // Convert report to XDR format for export
    let xdr_data = report.to_xdr();
    Ok(xdr_data)
}
