pub const SERIES_SEED: &[u8] = b"series";
pub const INVESTOR_SEED: &[u8] = b"investor";
pub const ACTION_SEED: &[u8] = b"action";
pub const ENTITLEMENT_SEED: &[u8] = b"entitlement";

/// Asia/Almaty is UTC+5 all year; period boundaries are Almaty midnights (03-domain §1, §3).
pub const ALMATY_UTC_OFFSET_SECS: i64 = 5 * 3600;
pub const BPS_DENOMINATOR: u16 = 10_000;
