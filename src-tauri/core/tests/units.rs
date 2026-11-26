use rocketsales_core::allowlist::{classic_url, is_allowed};
use rocketsales_core::cache::{Lookup, OfflineCache};
use rocketsales_core::config::{normalize_company, Config};
use rocketsales_core::crypto;
use rocketsales_core::secrets::{MemoryStore, SecretStore};
use std::sync::Arc;
use url::Url;

fn base() -> Url {
    Url::parse("https://acme.rocketorder.net").unwrap()
}

#[test]
fn classic_window_allows_only_the_companys_own_site_and_subdomains() {
    let b = base();
    for ok in [
        "https://acme.rocketorder.net/OrderGrid",
        "https://ACME.rocketorder.net/x?y=1#z",
        "https://login.acme.rocketorder.net/signin",
        "https://acme.rocketorder.net:443/x",
    ] {
        assert!(is_allowed(&Url::parse(ok).unwrap(), &b), "{ok} should be allowed");
    }
    for bad in [
        "https://evil.com/",
        "https://acmerocketorder.net/",
        "https://evilacme.rocketorder.net/",
        "https://rocketorder.net/",
        "https://acme.rocketorder.net.evil.com/",
        "https://acme.rocketorder.net@evil.com/",
        "https://user:pw@acme.rocketorder.net/",
        "http://acme.rocketorder.net/",
        "https://acme.rocketorder.net:8443/",
        "file:///C:/Windows/win.ini",
        "javascript:alert(1)",
        "data:text/html,hi",
        "about:blank",
        "ftp://acme.rocketorder.net/",
    ] {
        assert!(!is_allowed(&Url::parse(bad).unwrap(), &b), "{bad} must be refused");
    }
}

#[test]
fn classic_url_builds_only_paths_on_the_company_site() {
    let b = base();
    assert_eq!(classic_url(&b, "/OrderGrid").unwrap().as_str(), "https://acme.rocketorder.net/OrderGrid");
    assert_eq!(classic_url(&b, "/Report/DCR?x=1").unwrap().as_str(), "https://acme.rocketorder.net/Report/DCR?x=1");
    for bad in ["OrderGrid", "//evil.com/x", "https://evil.com", "/\\evil.com", "/a\nb", "", "javascript:alert(1)"] {
        assert!(classic_url(&b, bad).is_err(), "{bad:?} must be refused");
    }
}

#[test]
fn local_development_server_is_allowed_over_http_only_on_localhost() {
    let config = Config { base_url_template: "http://{company}.localhost:8081".into(), ..Config::default() };
    let url = config.base_url("acme").unwrap();
    assert_eq!(url.as_str(), "http://acme.localhost:8081/");
    assert!(is_allowed(&Url::parse("http://acme.localhost:8081/x").unwrap(), &url));
    assert!(!is_allowed(&Url::parse("http://acme.localhost:9999/x").unwrap(), &url));
    assert!(Config { base_url_template: "http://{company}.example.com".into(), ..Config::default() }.base_url("acme").is_err());
    assert!(Config { base_url_template: "https://u:p@{company}.example.com".into(), ..Config::default() }.base_url("acme").is_err());
}

#[test]
fn config_defaults_and_broken_files() {
    assert_eq!(Config::default().base_url("acme").unwrap().as_str(), "https://acme.rocketsalespharma.net/");
    assert_eq!(Config::from_json("{ not json").base_url_template, "https://{company}.rocketsalespharma.net");
    assert_eq!(
        Config::from_json(r#"{"base_url_template":"https://{company}.example.org"}"#).base_url("x1").unwrap().as_str(),
        "https://x1.example.org/"
    );
}

#[test]
fn company_names_are_only_host_safe_characters() {
    assert_eq!(normalize_company("  KAS ").unwrap(), "kas");
    for bad in ["", "a.b", "a/b", "a b", "-a", "a-", "a_b", "é", &"a".repeat(41)] {
        assert!(normalize_company(bad).is_err(), "{bad:?}");
    }
}

#[test]
fn aes_gcm_round_trip_and_tamper_detection() {
    let key = crypto::new_key();
    let blob = crypto::seal(&key, b"aad", b"secret data").unwrap();
    assert!(!blob.windows(11).any(|w| w == b"secret data"));
    assert_eq!(crypto::open(&key, b"aad", &blob).unwrap(), b"secret data");
    assert!(crypto::open(&key, b"other aad", &blob).is_err());
    assert!(crypto::open(&crypto::new_key(), b"aad", &blob).is_err());
    let mut flipped = blob.clone();
    *flipped.last_mut().unwrap() ^= 1;
    assert!(crypto::open(&key, b"aad", &flipped).is_err());
    assert_ne!(blob, crypto::seal(&key, b"aad", b"secret data").unwrap(), "a fresh nonce every time");
}

fn cache() -> (OfflineCache, Arc<MemoryStore>) {
    let secrets = Arc::new(MemoryStore::default());
    (OfflineCache::open_in_memory(secrets.clone()).unwrap(), secrets)
}

#[test]
fn cache_round_trip_expiry_and_owner_binding() {
    let (c, _) = cache();
    c.put("dashboard", "acme|a@b.c", 100, 200, b"{\"x\":1}").unwrap();
    match c.get("dashboard", "acme|a@b.c", 150).unwrap() {
        Lookup::Fresh(item) => assert_eq!((item.data.as_slice(), item.saved_at, item.expires_at), (&b"{\"x\":1}"[..], 100, 200)),
        other => panic!("{other:?}"),
    }
    assert_eq!(c.get("dashboard", "acme|other@b.c", 150).unwrap(), Lookup::Missing);
    assert_eq!(c.get("menu", "acme|a@b.c", 150).unwrap(), Lookup::Missing);
    assert_eq!(c.get("dashboard", "acme|a@b.c", 200).unwrap(), Lookup::Expired);
    assert_eq!(c.row_count().unwrap(), 0, "an expired copy is deleted");
}

#[test]
fn cache_rejects_a_row_whose_dates_were_edited_to_extend_the_offline_period() {
    let (c, _) = cache();
    c.put("dashboard", "acme|a@b.c", 100, 200, b"data").unwrap();
    {
        // reach into the file the way someone with a SQLite editor would
        let conn = rusqlite_edit(&c);
        conn("UPDATE entries SET expires_at = 9999999999");
    }
    assert_eq!(c.get("dashboard", "acme|a@b.c", 150).unwrap(), Lookup::Missing);
    assert_eq!(c.row_count().unwrap(), 0);
}

// small helper so the test does not need a second rusqlite dependency in scope
fn rusqlite_edit(c: &OfflineCache) -> impl Fn(&str) + '_ {
    move |sql| c.exec_for_test(sql)
}

#[test]
fn wipe_erases_rows_and_the_key_so_old_blobs_are_unreadable() {
    let (c, secrets) = cache();
    c.put("dashboard", "o", 1, 10_000, b"data").unwrap();
    assert!(secrets.get("offline-key").unwrap().is_some());
    c.wipe().unwrap();
    assert_eq!(c.row_count().unwrap(), 0);
    assert!(secrets.get("offline-key").unwrap().is_none());
}

#[test]
fn nothing_readable_is_written_to_disk() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("offline.db");
    let secrets = Arc::new(MemoryStore::default());
    {
        let c = OfflineCache::open(&path, secrets.clone()).unwrap();
        c.put("dashboard", "acme|boss@acme.com", 1, 1_000_000, b"VERY-SECRET-SALES-FIGURE-123456").unwrap();
    }
    let raw = std::fs::read(&path).unwrap();
    assert!(!raw.windows(13).any(|w| w == b"SALES-FIGURE-"), "plaintext found in the database file");
    // and the key is not in the file either
    let key = secrets.get("offline-key").unwrap().unwrap();
    assert!(!raw.windows(key.len()).any(|w| w == key.as_bytes()));
    // reopening with the key still reads it; with another key store it cannot
    let again = OfflineCache::open(&path, secrets).unwrap();
    assert!(matches!(again.get("dashboard", "acme|boss@acme.com", 2).unwrap(), Lookup::Fresh(_)));
    let stranger = OfflineCache::open(&path, Arc::new(MemoryStore::default())).unwrap();
    assert_eq!(stranger.get("dashboard", "acme|boss@acme.com", 2).unwrap(), Lookup::Missing);
}

#[test]
fn company_box_accepts_a_name_or_a_trusted_full_address() {
    let c = Config::default();
    let (name, url) = c.resolve("  Medcure ").unwrap();
    assert_eq!((name.as_str(), url.as_str()), ("medcure", "https://medcure.rocketsalespharma.net/"));
    let (name, url) = c.resolve("medcure.rocketorder.net").unwrap(); // the older domain is still trusted
    assert_eq!((name.as_str(), url.as_str()), ("medcure", "https://medcure.rocketorder.net/"));
    for typed in ["medcure.rocketsalespharma.net", "https://MedCure.RocketSalesPharma.net/", "medcure.rocketsalespharma.net/Login?x=1"] {
        let (name, url) = c.resolve(typed).unwrap();
        assert_eq!((name.as_str(), url.as_str()), ("medcure", "https://medcure.rocketsalespharma.net/"), "{typed}");
    }
}

#[test]
fn untrusted_or_tricky_addresses_are_refused_before_any_network_call() {
    let c = Config::default();
    for bad in [
        "medcure.evil.com", "medcure.rocketsalespharma.net.evil.com", "evil.com", "a.b.rocketorder.net",
        "medcure.rocketorder.net@evil.com", "user:pw@medcure.rocketsalespharma.net", "medcure.rocketsalespharma.net:8443",
        "http://medcure.rocketsalespharma.net", "-x.rocketorder.net", "medcure.xrocketorder.net", ".rocketorder.net",
    ] {
        let result = c.resolve(bad);
        assert!(result.is_err(), "{bad} must be refused, got {result:?}");
    }
}

#[test]
fn trusted_domains_can_be_extended_in_config_json() {
    let c = Config::from_json(r#"{"allowed_domains":["example.org"]}"#);
    assert!(c.resolve("acme.example.org").is_ok());
    assert!(c.resolve("acme.rocketorder.net").is_err(), "the list replaces the default domains");
    assert!(c.resolve("acme.rocketsalespharma.net").is_ok(), "the template's own domain is always trusted");
    assert_eq!(c.base_url("acme").unwrap().as_str(), "https://acme.rocketsalespharma.net/", "template keeps its default");
}

#[test]
fn saved_server_address_is_checked_again_before_use() {
    let c = Config::default();
    assert!(c.check_stored("medcure", "https://medcure.rocketsalespharma.net/").is_ok());
    assert!(c.check_stored("medcure", "https://medcure.rocketorder.net/").is_ok());
    assert!(c.check_stored("medcure", "https://other.rocketsalespharma.net/").is_err());
    assert!(c.check_stored("medcure", "https://medcure.evil.com/").is_err());
    assert!(c.check_stored("medcure", "http://medcure.rocketsalespharma.net/").is_err());
    assert!(c.check_stored("medcure", "not a url").is_err());
}
