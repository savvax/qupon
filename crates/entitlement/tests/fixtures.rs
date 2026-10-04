use serde::Deserialize;

#[derive(Deserialize)]
struct Fixtures {
    day_count_cases: Vec<serde_json::Value>,
    cases: Vec<serde_json::Value>,
}

#[test]
fn fixtures_load() {
    let raw = include_str!("../../../fixtures/entitlement.json");
    let f: Fixtures = serde_json::from_str(raw).expect("fixtures/entitlement.json parses");
    assert!(!f.day_count_cases.is_empty());
    assert!(!f.cases.is_empty());
}
