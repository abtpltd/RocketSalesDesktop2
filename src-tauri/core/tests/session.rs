//! Session rules against a scripted fake server (no network): sign-in, token refresh, offline copy and
//! expiry, switched-off computers, sign-out.
use rocketsales_core::api::{HttpRequest, HttpResponse, Method, Transport, TransportError};
use rocketsales_core::cache::OfflineCache;
use rocketsales_core::clock::Clock;
use rocketsales_core::config::Config;
use rocketsales_core::secrets::{MemoryStore, SecretStore};
use rocketsales_core::service::{Desktop, DeviceInfo, Kind};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};

const T0: i64 = 1_800_000_000;
const DAY: i64 = 86_400;

#[derive(Clone, Default)]
struct Mock {
    script: Arc<Mutex<VecDeque<Result<HttpResponse, TransportError>>>>,
    log: Arc<Mutex<Vec<HttpRequest>>>,
}

impl Mock {
    fn push(&self, r: Result<HttpResponse, TransportError>) {
        self.script.lock().unwrap().push_back(r);
    }
    fn requests(&self) -> Vec<HttpRequest> {
        self.log.lock().unwrap().clone()
    }
    fn paths(&self) -> Vec<String> {
        self.requests().iter().map(|r| r.url.clone()).collect()
    }
}

impl Transport for Mock {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        self.log.lock().unwrap().push(req);
        self.script.lock().unwrap().pop_front().expect("unexpected request: the script is empty")
    }
}

struct TestClock(AtomicI64);
impl Clock for TestClock {
    fn now(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}

fn ok(data: Value) -> Result<HttpResponse, TransportError> {
    Ok(HttpResponse { status: 200, body: json!({"ok": true, "data": data}).to_string().into_bytes() })
}

fn err(status: u16, code: &str, message: &str) -> Result<HttpResponse, TransportError> {
    Ok(HttpResponse { status, body: json!({"ok": false, "error": {"code": code, "message": message}}).to_string().into_bytes() })
}

fn session_payload(n: u32, now: i64, email: &str) -> Value {
    json!({
        "access_token": format!("A{n}"), "access_expires_at": now + 900,
        "refresh_token": format!("R{n}"), "refresh_expires_at": now + 90 * DAY,
        "user": {"name": "Boss", "email": email, "role": "ADMIN", "is_admin": true},
        "company": {"domain": "acme", "title": "Acme Ltd", "country": "KE", "currency": "KES"},
        "offline_days": 7, "server_time": now
    })
}

struct Rig {
    desktop: Desktop<Mock>,
    mock: Mock,
    clock: Arc<TestClock>,
    secrets: Arc<MemoryStore>,
}

fn rig() -> Rig {
    let mock = Mock::default();
    let clock = Arc::new(TestClock(AtomicI64::new(T0)));
    let secrets = Arc::new(MemoryStore::default());
    let cache = OfflineCache::open_in_memory(secrets.clone()).unwrap();
    let device = DeviceInfo { id: "dev-1".into(), name: "Office PC".into(), app_version: "0.1.0".into() };
    let desktop = Desktop::new(mock.clone(), clock.clone(), secrets.clone(), cache, Config::default(), device);
    Rig { desktop, mock, clock, secrets }
}

impl Rig {
    fn advance(&self, seconds: i64) {
        self.clock.0.fetch_add(seconds, Ordering::SeqCst);
    }
    fn now(&self) -> i64 {
        self.clock.now()
    }
    async fn signed_in(&self) {
        self.mock.push(ok(session_payload(1, self.now(), "boss@acme.com")));
        self.desktop.login("Acme", "boss@acme.com", "pw").await.unwrap();
    }
    fn refresh_secret(&self) -> Option<String> {
        self.secrets.get("refresh").unwrap()
    }
}

#[tokio::test]
async fn login_sends_device_details_and_keeps_refresh_token_in_the_secret_store() {
    let rig = rig();
    rig.mock.push(ok(session_payload(1, T0, "boss@acme.com")));
    let info = rig.desktop.login("  ACME ", "boss@acme.com", "pw").await.unwrap();
    assert_eq!(info.user.email, "boss@acme.com");
    assert_eq!(info.offline_days, 7);
    assert!(!info.offline);
    let request = &rig.mock.requests()[0];
    assert_eq!(request.url, "https://acme.rocketsalespharma.net/api/v1/desktop/login");
    assert_eq!(request.method, Method::Post);
    let body = request.json_body.as_ref().unwrap();
    assert_eq!(body["company"], "acme");
    assert_eq!(body["device_id"], "dev-1");
    assert_eq!(body["device_name"], "Office PC");
    assert!(rig.refresh_secret().unwrap().contains("R1"));
}

#[tokio::test]
async fn bad_company_or_empty_fields_never_reach_the_network() {
    let rig = rig();
    for company in ["", "a b", "evil.com/x", "-x", "a@b"] {
        assert_eq!(rig.desktop.login(company, "a@b.c", "pw").await.unwrap_err().code, "bad_company");
    }
    assert_eq!(rig.desktop.login("acme", "", "pw").await.unwrap_err().code, "bad_request");
    assert!(rig.mock.requests().is_empty());
}

#[tokio::test]
async fn server_messages_are_passed_through_plainly() {
    let rig = rig();
    rig.mock.push(err(401, "bad_credentials", "Check the email and password."));
    let e = rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err();
    assert_eq!((e.code.as_str(), e.message.as_str()), ("bad_credentials", "Check the email and password."));
    rig.mock.push(Ok(HttpResponse {
        status: 429,
        body: json!({"ok": false, "error": {"code": "rate_limited", "message": "Too many.", "retry_after_seconds": 600}}).to_string().into_bytes(),
    }));
    let e = rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err();
    assert_eq!((e.code.as_str(), e.retry_after_seconds), ("rate_limited", Some(600)));
    rig.mock.push(err(403, "company_not_enabled", "The desktop app is not enabled for this company."));
    assert_eq!(rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err().code, "company_not_enabled");
}

#[tokio::test]
async fn unknown_address_404_is_shown_plainly_json_or_html() {
    let rig = rig();
    rig.mock.push(err(404, "not_found", "This desktop address does not exist on this server."));
    let e = rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err();
    assert_eq!(e.code, "unsupported");
    assert!(e.message.contains("does not exist on this server"));
    rig.mock.push(Ok(HttpResponse { status: 404, body: b"404 Not Found\n\nThe resource could not be found.".to_vec() }));
    let e = rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err();
    assert_eq!(e.code, "unsupported");
    assert!(e.message.contains("404 Not Found") && e.message.contains("older version"));
    rig.mock.push(Ok(HttpResponse { status: 200, body: b"<html>not json</html>".to_vec() }));
    assert_eq!(rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err().code, "unknown");
}

#[tokio::test]
async fn offline_at_login_says_so() {
    let rig = rig();
    rig.mock.push(Err(TransportError::Offline("dns".into())));
    assert_eq!(rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err().code, "offline");
    rig.mock.push(Err(TransportError::Timeout));
    assert_eq!(rig.desktop.login("acme", "a@b.c", "x").await.unwrap_err().code, "timeout");
}

#[tokio::test]
async fn dashboard_is_fetched_with_bearer_and_long_timeout_then_kept_for_offline() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"kind": "kpi", "data": {"x": 1}})));
    let got = rig.desktop.fetch(Kind::Dashboard, None).await.unwrap();
    assert_eq!((got.source.as_str(), got.saved_at), ("server", T0));
    let request = rig.mock.requests().pop().unwrap();
    assert_eq!(request.url, "https://acme.rocketsalespharma.net/api/v1/desktop/dashboard");
    assert_eq!(request.bearer.as_deref(), Some("A1"));
    assert_eq!(request.timeout.as_secs(), 120);

    rig.advance(3 * 3600);
    rig.mock.push(Err(TransportError::Offline("no network".into())));
    let offline = rig.desktop.fetch(Kind::Dashboard, None).await.unwrap();
    assert_eq!(offline.source, "offline");
    assert_eq!(offline.saved_at, T0, "'synced X ago' must show when it was saved, not now");
    assert_eq!(offline.data["data"]["x"], 1);
    assert!(rig.desktop.session_info().await.unwrap().offline);
}

#[tokio::test]
async fn timeout_also_falls_back_to_the_offline_copy_and_server_5xx_too() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"n": 1})));
    rig.desktop.fetch(Kind::Menu, None).await.unwrap();
    rig.mock.push(Err(TransportError::Timeout));
    assert_eq!(rig.desktop.fetch(Kind::Menu, None).await.unwrap().source, "offline");
    rig.mock.push(Ok(HttpResponse { status: 502, body: b"Bad gateway".to_vec() }));
    assert_eq!(rig.desktop.fetch(Kind::Menu, None).await.unwrap().source, "offline");
}

#[tokio::test]
async fn offline_copy_expires_after_the_companys_offline_days_and_is_deleted() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"n": 1})));
    rig.desktop.fetch(Kind::Dashboard, None).await.unwrap();
    rig.advance(7 * DAY - 1);
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, None).await.unwrap().source, "offline");
    rig.advance(2);
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err().code, "offline_expired");
    // already deleted: the next offline try has nothing, and says "offline", not "expired"
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err().code, "offline");
}

#[tokio::test]
async fn offline_with_no_copy_is_a_clear_error() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err().code, "offline");
}

#[tokio::test]
async fn expired_access_token_is_refreshed_before_the_request() {
    let rig = rig();
    rig.signed_in().await;
    rig.advance(900 - 10); // inside the 30 s safety margin
    rig.mock.push(ok(session_payload(2, rig.now(), "boss@acme.com")));
    rig.mock.push(ok(json!({"n": 1})));
    rig.desktop.fetch(Kind::Menu, None).await.unwrap();
    let paths = rig.mock.paths();
    assert!(paths[1].ends_with("/refresh") && paths[2].ends_with("/menu"));
    assert_eq!(rig.mock.requests()[1].json_body.as_ref().unwrap()["refresh_token"], "R1");
    assert_eq!(rig.mock.requests()[2].bearer.as_deref(), Some("A2"));
    assert!(rig.refresh_secret().unwrap().contains("R2"), "the rotated refresh token must be saved");
}

#[tokio::test]
async fn a_401_from_the_server_triggers_one_refresh_and_one_retry() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(err(401, "token_expired", "The sign-in has expired."));
    rig.mock.push(ok(session_payload(2, T0, "boss@acme.com")));
    rig.mock.push(ok(json!({"n": 2})));
    let got = rig.desktop.fetch(Kind::Menu, None).await.unwrap();
    assert_eq!((got.source.as_str(), got.data["n"].as_i64()), ("server", Some(2)));
    assert_eq!(rig.mock.requests().len(), 4);
}

#[tokio::test]
async fn switched_off_computer_wipes_everything_when_the_server_says_so_on_refresh() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"n": 1})));
    rig.desktop.fetch(Kind::Dashboard, None).await.unwrap();
    rig.advance(1000);
    rig.mock.push(err(403, "device_revoked", "This computer has been switched off by your administrator."));
    let e = rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err();
    assert_eq!(e.code, "device_revoked");
    assert!(rig.refresh_secret().is_none());
    assert!(rig.secrets.get("offline-key").unwrap().is_none(), "the encryption key must be thrown away");
    assert!(rig.desktop.session_info().await.is_none());
    // nothing readable is left: even offline there is no copy
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.restore().await.unwrap().is_none(), true);
}

#[tokio::test]
async fn switched_off_computer_is_wiped_when_the_dashboard_request_itself_is_refused() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(err(403, "device_revoked", "This computer has been switched off by your administrator."));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err().code, "device_revoked");
    assert!(rig.refresh_secret().is_none());
    assert!(rig.desktop.session_info().await.is_none());
}

#[tokio::test]
async fn expired_refresh_token_asks_to_sign_in_again_and_drops_only_the_token() {
    let rig = rig();
    rig.signed_in().await;
    rig.advance(1000);
    rig.mock.push(err(401, "token_expired", "The sign-in has expired."));
    let e = rig.desktop.fetch(Kind::Menu, None).await.unwrap_err();
    assert_eq!(e.code, "session_expired");
    assert!(rig.refresh_secret().is_none());
}

#[tokio::test]
async fn sign_out_calls_the_server_then_wipes_even_if_the_server_is_unreachable() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"n": 1})));
    rig.desktop.fetch(Kind::Dashboard, None).await.unwrap();
    rig.mock.push(Err(TransportError::Offline("x".into())));
    rig.desktop.sign_out().await.unwrap();
    let last = rig.mock.requests().pop().unwrap();
    assert!(last.url.ends_with("/logout") && last.bearer.as_deref() == Some("A1"));
    assert!(rig.refresh_secret().is_none() && rig.secrets.get("offline-key").unwrap().is_none());
    assert!(rig.desktop.session_info().await.is_none());
    assert!(rig.desktop.fetch(Kind::Dashboard, None).await.is_err());
}

#[tokio::test]
async fn restore_without_a_saved_sign_in_is_signed_out() {
    let rig = rig();
    assert!(rig.desktop.restore().await.unwrap().is_none());
    assert!(rig.mock.requests().is_empty());
}

#[tokio::test]
async fn restore_online_rotates_the_refresh_token() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(session_payload(2, rig.now(), "boss@acme.com")));
    let info = rig.desktop.restore().await.unwrap().unwrap();
    assert!(!info.offline);
    assert!(rig.refresh_secret().unwrap().contains("R2"));
}

#[tokio::test]
async fn restore_offline_continues_from_the_encrypted_copy_until_it_expires() {
    let rig = rig();
    rig.signed_in().await;
    rig.advance(2 * DAY);
    rig.mock.push(Err(TransportError::Offline("x".into())));
    let info = rig.desktop.restore().await.unwrap().unwrap();
    assert!(info.offline && info.user.email == "boss@acme.com" && info.offline_days == 7);
    rig.advance(6 * DAY); // 8 days after sign-in
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.restore().await.unwrap_err().code, "offline_expired");
}

#[tokio::test]
async fn restore_with_a_revoked_device_wipes_and_reports_it() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(err(403, "device_revoked", "This computer has been switched off by your administrator."));
    assert_eq!(rig.desktop.restore().await.unwrap_err().code, "device_revoked");
    assert!(rig.refresh_secret().is_none() && rig.secrets.get("offline-key").unwrap().is_none());
}

#[tokio::test]
async fn a_different_user_starts_with_an_empty_offline_copy() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"mine": true})));
    rig.desktop.fetch(Kind::Dashboard, None).await.unwrap();
    rig.mock.push(ok(session_payload(5, rig.now(), "other@acme.com")));
    rig.desktop.login("acme", "other@acme.com", "pw").await.unwrap();
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err().code, "offline");
}

#[tokio::test]
async fn kas_month_is_part_of_the_cache_key() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"month": "Oct-2026"})));
    rig.desktop.fetch(Kind::Dashboard, Some("Oct-2026")).await.unwrap();
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, Some("Sep-2026")).await.unwrap_err().code, "offline");
    rig.mock.push(Err(TransportError::Offline("x".into())));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, Some("Oct-2026")).await.unwrap().data["month"], "Oct-2026");
}

#[tokio::test]
async fn new_computer_waiting_for_approval_is_told_so_and_nothing_is_stored() {
    let rig = rig();
    rig.mock.push(err(403, "device_pending", "This computer is waiting for approval."));
    let e = rig.desktop.login("acme", "boss@acme.com", "pw").await.unwrap_err();
    assert_eq!(e.code, "device_pending");
    assert!(e.message.contains("waiting for approval"));
    assert!(rig.refresh_secret().is_none(), "no token may be kept for a computer that is not approved");
    assert!(rig.desktop.session_info().await.is_none());
}

#[tokio::test]
async fn computer_that_becomes_pending_loses_its_saved_sign_in_but_not_the_message() {
    let rig = rig();
    rig.signed_in().await;
    rig.advance(1000);
    rig.mock.push(err(403, "device_pending", "This computer is waiting for approval."));
    assert_eq!(rig.desktop.fetch(Kind::Menu, None).await.unwrap_err().code, "device_pending");
    assert!(rig.refresh_secret().is_none());
}

#[tokio::test]
async fn idle_too_long_asks_to_sign_in_again_without_wiping_the_offline_copy_rules() {
    let rig = rig();
    rig.signed_in().await;
    rig.advance(1000);
    rig.mock.push(err(401, "token_expired", "This computer was not used for a while. Please sign in again."));
    assert_eq!(rig.desktop.fetch(Kind::Menu, None).await.unwrap_err().code, "session_expired");
}

#[tokio::test]
async fn token_reuse_cut_off_by_the_server_wipes_the_computer() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"n": 1})));
    rig.desktop.fetch(Kind::Dashboard, None).await.unwrap();
    rig.advance(1000);
    rig.mock.push(err(403, "device_revoked", "This computer has been switched off for security reasons. Ask your administrator."));
    assert_eq!(rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err().code, "device_revoked");
    assert!(rig.refresh_secret().is_none() && rig.secrets.get("offline-key").unwrap().is_none());
}

#[tokio::test]
async fn company_with_its_own_domain_signs_in_there_and_restores_to_the_same_server() {
    let rig = rig();
    rig.mock.push(ok(session_payload(1, T0, "boss@acme.com")));
    rig.desktop.login("acme.rocketsalespharma.net", "boss@acme.com", "pw").await.unwrap();
    let first = &rig.mock.requests()[0];
    assert_eq!(first.url, "https://acme.rocketsalespharma.net/api/v1/desktop/login");
    assert_eq!(first.json_body.as_ref().unwrap()["company"], "acme", "the server expects only the company name");
    rig.mock.push(ok(session_payload(2, rig.now(), "boss@acme.com")));
    let info = rig.desktop.restore().await.unwrap().unwrap();
    assert_eq!(rig.mock.requests()[1].url, "https://acme.rocketsalespharma.net/api/v1/desktop/refresh");
    assert_eq!(info.base_url, "https://acme.rocketsalespharma.net/");
}

#[tokio::test]
async fn untrusted_address_typed_as_company_never_reaches_the_network() {
    let rig = rig();
    assert_eq!(rig.desktop.login("acme.evil.com", "a@b.c", "pw").await.unwrap_err().code, "bad_company");
    assert!(rig.mock.requests().is_empty());
}

#[tokio::test]
async fn master_list_sends_search_and_paging_and_keeps_a_copy_per_page_for_offline() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"module": "customers", "rows": [{"code": "C1"}], "total": 1})));
    let got = rig.desktop.fetch_list("customers", "shop & co", 2, 99999, "active").await.unwrap();
    assert_eq!(got.source, "server");
    let request = rig.mock.requests().pop().unwrap();
    assert_eq!(
        request.url,
        "https://acme.rocketsalespharma.net/api/v1/desktop/master/customers?q=shop+%26+co&page=2&size=500&status=active"
    );
    assert_eq!(request.bearer.as_deref(), Some("A1"));

    rig.mock.push(Err(TransportError::Offline("no network".into())));
    let offline = rig.desktop.fetch_list("customers", "shop & co", 2, 99999, "active").await.unwrap();
    assert_eq!((offline.source.as_str(), offline.data["rows"][0]["code"].as_str()), ("offline", Some("C1")));

    rig.mock.push(Err(TransportError::Offline("no network".into())));
    let other_page = rig.desktop.fetch_list("customers", "shop & co", 3, 99999, "active").await.unwrap_err();
    assert_eq!(other_page.code, "offline", "a page never seen before has no saved copy");
}

#[tokio::test]
async fn master_list_name_is_checked_before_anything_is_sent() {
    let rig = rig();
    rig.signed_in().await;
    let before = rig.mock.requests().len();
    for bad in ["", "../me", "Customers", "a/b"] {
        assert_eq!(rig.desktop.fetch_list(bad, "", 1, 10, "").await.unwrap_err().code, "bad_request");
    }
    assert_eq!(rig.mock.requests().len(), before);
}

#[tokio::test]
async fn mapping_request_names_the_rep_and_kind_and_defaults_to_customers() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"module": "mapping", "reps": [], "mapping": {"hq": [], "area": [], "code": []}})));
    rig.desktop.fetch_mapping("Ann & Co", "doctor").await.unwrap();
    assert_eq!(
        rig.mock.requests().pop().unwrap().url,
        "https://acme.rocketsalespharma.net/api/v1/desktop/master/mapping?rep=Ann+%26+Co&kind=doctor"
    );
    rig.mock.push(ok(json!({"module": "mapping"})));
    rig.desktop.fetch_mapping("", "whatever").await.unwrap();
    assert!(rig.mock.requests().pop().unwrap().url.ends_with("mapping?rep=&kind=customer"));
}

#[tokio::test]
async fn orders_request_carries_dates_status_search_and_paging_and_is_kept_for_offline() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"rows": [{"order_number": "SO1"}], "total": 1})));
    rig.desktop.fetch_orders("2026-10-01", "2026-10-31", "Created", "a&b", 2, 10).await.unwrap();
    assert_eq!(
        rig.mock.requests().pop().unwrap().url,
        "https://acme.rocketsalespharma.net/api/v1/desktop/orders?from=2026-10-01&to=2026-10-31&status=Created&q=a%26b&page=2&size=10"
    );
    rig.mock.push(Err(TransportError::Offline("no network".into())));
    let offline = rig.desktop.fetch_orders("2026-10-01", "2026-10-31", "Created", "a&b", 2, 10).await.unwrap();
    assert_eq!(offline.source, "offline");
}

#[tokio::test]
async fn order_detail_checks_the_key_then_asks_for_it_and_keeps_a_copy() {
    let rig = rig();
    rig.signed_in().await;
    let before = rig.mock.requests().len();
    for bad in ["", "a b", "../x", "k&x=1"] {
        assert_eq!(rig.desktop.fetch_order(bad).await.unwrap_err().code, "bad_request");
    }
    assert_eq!(rig.mock.requests().len(), before);
    rig.mock.push(ok(json!({"order": {"order_number": "SO1"}, "lines": []})));
    rig.desktop.fetch_order("ag5zfmFiYy1rZXk").await.unwrap();
    assert_eq!(
        rig.mock.requests().pop().unwrap().url,
        "https://acme.rocketsalespharma.net/api/v1/desktop/order?key=ag5zfmFiYy1rZXk"
    );
    rig.mock.push(Err(TransportError::Offline("no network".into())));
    assert_eq!(rig.desktop.fetch_order("ag5zfmFiYy1rZXk").await.unwrap().source, "offline");
}

#[tokio::test]
async fn report_name_is_checked_and_a_refusal_for_the_role_keeps_the_session() {
    let rig = rig();
    rig.signed_in().await;
    let before = rig.mock.requests().len();
    for bad in ["", "../me", "Order", "a/b"] {
        assert_eq!(rig.desktop.fetch_report(bad, "", "", "", "", "", 1, 10).await.unwrap_err().code, "bad_request");
    }
    assert_eq!(rig.mock.requests().len(), before);
    rig.mock.push(err(403, "not_allowed", "This report is limited to your own team."));
    let e = rig.desktop.fetch_report("order_summary", "2026-10-01", "2026-10-05", "", "", "", 1, 100).await.unwrap_err();
    assert_eq!(e.code, "not_allowed");
    assert!(rig.desktop.session_info().await.is_some(), "being refused one report must not sign the person out");
    assert_eq!(
        rig.mock.requests().pop().unwrap().url,
        "https://acme.rocketsalespharma.net/api/v1/desktop/report/order_summary?from=2026-10-01&to=2026-10-05&q=&rep=&kind=&page=1&size=100"
    );
}

#[tokio::test]
async fn map_setting_comes_with_sign_in_survives_offline_and_the_map_state_rides_on_refresh() {
    let rig = rig();
    // an older server sends no map: OpenStreetMap on auto, no file
    rig.signed_in().await;
    let info = rig.desktop.session_info().await.unwrap();
    assert_eq!((info.map.source.as_str(), info.map.pmtiles_url.as_str()), ("auto", ""));
    // no map state yet: the refresh body is unchanged
    let mut payload = session_payload(2, rig.now(), "boss@acme.com");
    payload["map"] = json!({"source": "auto", "pmtiles_url": "https://maps.example.com/ea.pmtiles"});
    rig.mock.push(ok(payload));
    let info = rig.desktop.restore().await.unwrap().unwrap();
    assert_eq!(info.map.pmtiles_url, "https://maps.example.com/ea.pmtiles");
    let body = rig.mock.requests()[1].json_body.clone().unwrap();
    assert!(body.get("map_state").is_none());
    // the map screen reports its source; the next refresh carries it (unknown words are ignored)
    rig.desktop.set_map_state("protomaps");
    rig.desktop.set_map_state("anything");
    rig.mock.push(ok(session_payload(3, rig.now(), "boss@acme.com")));
    rig.desktop.restore().await.unwrap();
    assert_eq!(rig.mock.requests()[2].json_body.as_ref().unwrap()["map_state"], "protomaps");
    // offline the last known setting stays (refresh 3 had no map: back to the default)
    rig.mock.push(Err(TransportError::Offline("x".into())));
    let info = rig.desktop.restore().await.unwrap().unwrap();
    assert!(info.offline);
    assert_eq!(info.map.source, "auto");
}

#[tokio::test]
async fn saved_reports_come_from_the_offline_copy_without_calling_the_server() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"title": "Attendance", "rows": [{"rep": "A"}], "from": "2026-10-01"})));
    rig.desktop.fetch_report("attendance", "2026-10-01", "2026-10-07", "", "", "", 1, 100).await.unwrap();
    rig.advance(60);
    rig.mock.push(ok(json!({"title": "Attendance", "rows": [{"rep": "B"}], "from": "2026-10-08"})));
    rig.desktop.fetch_report("attendance", "2026-10-08", "2026-10-14", "", "", "", 1, 100).await.unwrap();
    rig.mock.push(ok(json!({"title": "Visits", "rows": []})));
    rig.desktop.fetch_report("visits", "", "", "", "", "", 1, 100).await.unwrap();
    let before = rig.mock.paths().len();
    let saved = rig.desktop.saved_reports("attendance").await.unwrap();
    assert_eq!(rig.mock.paths().len(), before, "reading saved copies must not call the server");
    assert_eq!(saved.len(), 2, "both date ranges are kept, the other report is not mixed in");
    assert_eq!(saved[0].data["rows"][0]["rep"], "B", "newest first");
    assert_eq!(saved[0].source, "offline");
    assert!(rig.desktop.saved_reports("../x").await.is_err());
    rig.advance(8 * DAY);
    assert!(rig.desktop.saved_reports("attendance").await.unwrap().is_empty(), "expired copies are not offered");
}

// ---- computer key: sign-in and refresh are signed by a key kept in the credential store ----------------------------
fn verify(body: &Value, message: &str) -> bool {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let key: [u8; 32] = B64.decode(body["device_key"].as_str().unwrap()).unwrap().try_into().unwrap();
    let sig: [u8; 64] = B64.decode(body["sig"].as_str().unwrap()).unwrap().try_into().unwrap();
    VerifyingKey::from_bytes(&key).unwrap().verify(message.as_bytes(), &Signature::from_bytes(&sig)).is_ok()
}

#[tokio::test]
async fn login_is_signed_for_this_company_email_and_computer() {
    let rig = rig();
    rig.mock.push(ok(session_payload(1, T0, "Boss@Acme.com")));
    rig.desktop.login("acme", " Boss@Acme.com ", "pw").await.unwrap();
    let body = rig.mock.requests()[0].json_body.clone().unwrap();
    assert_eq!(body["ts"], T0);
    assert!(verify(&body, &format!("login|acme|boss@acme.com|dev-1|{T0}")), "the server checks exactly this text");
    assert!(!verify(&body, &format!("login|acme|someone@else.com|dev-1|{T0}")));
}

#[tokio::test]
async fn refresh_is_signed_and_the_same_key_is_used_every_time() {
    let rig = rig();
    rig.signed_in().await;
    rig.advance(1000); // the 15 minute access token has expired
    rig.mock.push(ok(session_payload(2, rig.now(), "boss@acme.com")));
    rig.mock.push(ok(json!({"kind": "kpi"})));
    let _ = rig.desktop.fetch(Kind::Dashboard, None).await;
    let reqs = rig.mock.requests();
    let login = reqs[0].json_body.clone().unwrap();
    let refresh = reqs.iter().find(|r| r.url.ends_with("/desktop/refresh")).expect("refresh was sent").json_body.clone().unwrap();
    assert_eq!(login["device_key"], refresh["device_key"], "one key per computer");
    assert!(verify(&refresh, &format!("refresh|acme|dev-1|{}", refresh["ts"])));
    assert!(refresh["ts"].as_i64().unwrap() > login["ts"].as_i64().unwrap());
}

#[tokio::test]
async fn a_new_app_start_on_the_same_computer_reuses_the_stored_key() {
    let first = rig();
    first.mock.push(ok(session_payload(1, T0, "boss@acme.com")));
    first.desktop.login("acme", "boss@acme.com", "pw").await.unwrap();
    let key1 = first.mock.requests()[0].json_body.clone().unwrap()["device_key"].clone();
    // the app restarts: a new Desktop over the same credential store
    let mock = Mock::default();
    let cache = OfflineCache::open_in_memory(first.secrets.clone()).unwrap();
    let device = DeviceInfo { id: "dev-1".into(), name: "Office PC".into(), app_version: "0.1.0".into() };
    let again = Desktop::new(mock.clone(), first.clock.clone(), first.secrets.clone(), cache, Config::default(), device);
    mock.push(ok(session_payload(2, T0, "boss@acme.com")));
    again.login("acme", "boss@acme.com", "pw").await.unwrap();
    assert_eq!(mock.requests()[0].json_body.clone().unwrap()["device_key"], key1);
}

#[tokio::test]
async fn a_key_the_server_does_not_accept_ends_the_sign_in_without_erasing_the_offline_copy() {
    let rig = rig();
    rig.signed_in().await;
    rig.advance(1000);
    rig.mock.push(err(403, "device_key_invalid", "This computer could not prove it is the one registered."));
    let e = rig.desktop.fetch(Kind::Dashboard, None).await.unwrap_err();
    assert_eq!(e.code, "device_key_invalid");
    assert!(rig.refresh_secret().is_none(), "the saved sign-in is dropped so the person signs in again");
}

#[tokio::test]
async fn list_copy_loads_once_then_asks_only_for_changes_and_survives_going_offline() {
    let rig = rig();
    rig.signed_in().await;
    rig.mock.push(ok(json!({"full": true, "columns": [{"key":"name","title":"Name"}], "keys_complete": true, "keys": ["a","b"],
        "server_time": 1000, "rows": [{"key":"a","name":"Alpha","status":"Active"},{"key":"b","name":"Beta","status":"Active"}]})));
    let first = rig.desktop.sync_list("customers").await.unwrap();
    assert_eq!(first["total"], 2);
    rig.mock.push(ok(json!({"full": false, "columns": [], "keys_complete": true, "keys": ["a","b","c"], "server_time": 1100,
        "rows": [{"key":"c","name":"Gamma","status":"Active"}]})));
    let second = rig.desktop.sync_list("customers").await.unwrap();
    assert_eq!((second["changed"].clone(), second["total"].clone()), (json!(1), json!(3)));
    let paths = rig.mock.paths();
    assert!(paths[paths.len() - 2].ends_with("since=0"), "{:?}", paths);
    assert!(paths[paths.len() - 1].ends_with("since=1000"), "{:?}", paths);
    rig.mock.push(Err(TransportError::Offline("x".into())));
    let off = rig.desktop.sync_list("customers").await.unwrap();
    assert_eq!(off["offline"], true);
    let page = rig.desktop.local_list("customers", "gam", 1, 50, "", "", false).await.unwrap();
    assert_eq!(page.data["total"], 1);
    assert_eq!(rig.desktop.local_list("doctors", "", 1, 50, "", "", false).await.unwrap_err().code, "no_copy");
}
