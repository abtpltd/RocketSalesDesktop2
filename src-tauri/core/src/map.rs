//! The map pictures of Eagle Eye View, kept on this computer.
//!
//! Each computer downloads only the map pieces its user looks at, straight from the map source (never through the
//! company server), and keeps them in `map-cache.db` next to the offline copy. Seen areas open from disk, also
//! without internet. Map data is public, so the cache is not encrypted and is not wiped when another person signs in.
//!
//! Two sources, chosen per company by the provider on /superadmin/DesktopControl (sent with sign-in as `map`):
//! - `osm`: OpenStreetMap's public picture tiles. Their usage policy allows keeping what is viewed but not bulk
//!   downloading, so nothing is fetched ahead; each request names the app; at most a few downloads run at once.
//! - `protomaps`: one PMTiles file (for example East Africa) on free storage. The map screen asks for byte ranges
//!   of that file; each range is downloaded once and kept the same way.
//! `auto` uses OpenStreetMap and moves to Protomaps when OpenStreetMap refuses this computer (403 / 418 / 429), when a
//! Protomaps file is set. A refusal pauses OpenStreetMap downloads on this computer for `BLOCK_SECONDS`.
//!
//! Housekeeping: pieces older than `REFRESH_AFTER` are downloaded again when online (the old copy is shown if that
//! fails); the cache stays under `max_bytes`, least recently used pieces go first.
use crate::errors::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tokio::sync::Semaphore;

pub const OSM_TILE_URL: &str = "https://tile.openstreetmap.org";
pub const DEFAULT_MAX_BYTES: i64 = 500 * 1024 * 1024;
pub const REFRESH_AFTER: i64 = 30 * 86400;
pub const BLOCK_SECONDS: i64 = 6 * 3600;
pub const MAX_ZOOM: u32 = 19;
/// one PMTiles request is a header, a directory or one vector tile; anything larger is refused
pub const MAX_RANGE: u64 = 4 * 1024 * 1024;
const PARALLEL_DOWNLOADS: usize = 4;
const TRIM_EVERY_PUTS: u32 = 100;
const TIMEOUT: Duration = Duration::from_secs(20);

/// The map setting for this company, as the server sends it with sign-in and refresh.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MapSettings {
    /// "auto", "osm" or "protomaps"
    #[serde(default = "auto")]
    pub source: String,
    /// https address of the .pmtiles file ("" when none is set)
    #[serde(default)]
    pub pmtiles_url: String,
}

fn auto() -> String {
    "auto".to_string()
}

impl Default for MapSettings {
    fn default() -> Self {
        MapSettings { source: auto(), pmtiles_url: String::new() }
    }
}

/// What the map screen gets: where pictures come from now, and whether OpenStreetMap refused this computer.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MapStatus {
    /// "osm" or "protomaps": the source the map screen should draw
    pub use_source: String,
    pub pmtiles_url: String,
    pub source_setting: String,
    /// unix seconds until which OpenStreetMap downloads are paused (0: not paused)
    pub osm_blocked_until: i64,
    pub cached_bytes: i64,
    pub cached_pieces: i64,
    pub max_bytes: i64,
}

/// The short state sent to the server with the next refresh (shown to the provider per company).
pub fn state_word(status: &MapStatus, now: i64) -> &'static str {
    if status.use_source == "protomaps" {
        "protomaps"
    } else if status.osm_blocked_until > now {
        "osm_blocked"
    } else {
        "osm"
    }
}

/// Which source to draw: the provider's setting, and for "auto" whether OpenStreetMap refused this computer.
pub fn choose_source(settings: &MapSettings, osm_blocked: bool) -> &'static str {
    let has_file = valid_pmtiles_url(&settings.pmtiles_url);
    match settings.source.as_str() {
        "protomaps" if has_file => "protomaps",
        "osm" => "osm",
        _ if osm_blocked && has_file => "protomaps",
        _ => "osm",
    }
}

pub fn valid_pmtiles_url(url: &str) -> bool {
    match url::Url::parse(url) {
        Ok(u) => {
            u.scheme() == "https"
                && u.host_str().is_some()
                && u.username().is_empty()
                && u.password().is_none()
                && u.path().to_ascii_lowercase().ends_with(".pmtiles")
                && url.len() <= 500
        }
        Err(_) => false,
    }
}

pub fn valid_tile(z: u32, x: u32, y: u32) -> bool {
    z <= MAX_ZOOM && (x as u64) < (1u64 << z) && (y as u64) < (1u64 << z)
}

/// `/osm/{z}/{x}/{y}.png` (the address the map screen asks the app for) to (z, x, y).
pub fn parse_tile_path(path: &str) -> Option<(u32, u32, u32)> {
    let rest = path.strip_prefix("/osm/")?.strip_suffix(".png")?;
    let mut parts = rest.split('/');
    let z = parts.next()?.parse().ok()?;
    let x = parts.next()?.parse().ok()?;
    let y = parts.next()?.parse().ok()?;
    if parts.next().is_some() || !valid_tile(z, x, y) {
        return None;
    }
    Some((z, x, y))
}

// ---- downloading ------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum FetchError {
    /// no connection, timeout or a broken answer
    Network(String),
}

pub trait MapFetch: Send + Sync {
    /// GET `url`, with `Range: bytes=offset-(offset+length-1)` when a range is given. Returns (status, body).
    fn get(&self, url: &str, range: Option<(u64, u64)>) -> impl std::future::Future<Output = Result<(u16, Vec<u8>), FetchError>> + Send;
}

pub struct ReqwestMapFetch {
    client: reqwest::Client,
}

impl ReqwestMapFetch {
    /// `user_agent` names the app and its version, as OpenStreetMap's tile policy asks.
    pub fn new(user_agent: &str) -> Result<Self, AppError> {
        let client = reqwest::Client::builder()
            .user_agent(user_agent)
            .connect_timeout(Duration::from_secs(10))
            .timeout(TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(3))
            .build()
            .map_err(|e| AppError::internal(e.to_string()))?;
        Ok(ReqwestMapFetch { client })
    }
}

impl MapFetch for ReqwestMapFetch {
    async fn get(&self, url: &str, range: Option<(u64, u64)>) -> Result<(u16, Vec<u8>), FetchError> {
        let mut req = self.client.get(url);
        if let Some((offset, length)) = range {
            req = req.header("Range", format!("bytes={}-{}", offset, offset + length - 1));
        }
        let resp = req.send().await.map_err(|e| FetchError::Network(e.to_string()))?;
        let status = resp.status().as_u16();
        let body = resp.bytes().await.map_err(|e| FetchError::Network(e.to_string()))?;
        Ok((status, body.to_vec()))
    }
}

// ---- the store ----------------------------------------------------------------------------------------------------

struct Piece {
    data: Vec<u8>,
    fetched_at: i64,
}

pub struct MapStore {
    conn: Mutex<Connection>,
    max_bytes: i64,
    puts: AtomicU32,
}

fn db_error(e: rusqlite::Error) -> AppError {
    AppError::new("map_store", format!("The saved map could not be used: {e}"))
}

impl MapStore {
    pub fn open(path: &Path, max_bytes: i64) -> Result<Self, AppError> {
        Self::init(Connection::open(path).map_err(db_error)?, max_bytes)
    }

    pub fn open_in_memory(max_bytes: i64) -> Result<Self, AppError> {
        Self::init(Connection::open_in_memory().map_err(db_error)?, max_bytes)
    }

    fn init(conn: Connection, max_bytes: i64) -> Result<Self, AppError> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS pieces (
                key TEXT PRIMARY KEY,
                data BLOB NOT NULL,
                size INTEGER NOT NULL,
                fetched_at INTEGER NOT NULL,
                used_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS pieces_used ON pieces (used_at);
             CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value INTEGER NOT NULL);",
        )
        .map_err(db_error)?;
        Ok(MapStore { conn: Mutex::new(conn), max_bytes, puts: AtomicU32::new(0) })
    }

    fn get(&self, key: &str, now: i64) -> Result<Option<Piece>, AppError> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row("SELECT data, fetched_at FROM pieces WHERE key = ?1", params![key], |r| {
                Ok(Piece { data: r.get(0)?, fetched_at: r.get(1)? })
            })
            .optional()
            .map_err(db_error)?;
        if row.is_some() {
            conn.execute("UPDATE pieces SET used_at = ?2 WHERE key = ?1", params![key, now]).map_err(db_error)?;
        }
        Ok(row)
    }

    fn put(&self, key: &str, data: &[u8], now: i64) -> Result<(), AppError> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO pieces (key, data, size, fetched_at, used_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![key, data, data.len() as i64, now],
            )
            .map_err(db_error)?;
        }
        if self.puts.fetch_add(1, Ordering::Relaxed) % TRIM_EVERY_PUTS == 0 {
            self.trim()?;
        }
        Ok(())
    }

    /// Removes the least recently used pieces until the cache is under 90% of its limit.
    pub fn trim(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        let total: i64 = conn.query_row("SELECT COALESCE(SUM(size), 0) FROM pieces", [], |r| r.get(0)).map_err(db_error)?;
        if total <= self.max_bytes {
            return Ok(());
        }
        let target = self.max_bytes / 10 * 9;
        let mut over = total - target;
        let mut stmt = conn.prepare("SELECT key, size FROM pieces ORDER BY used_at ASC").map_err(db_error)?;
        let rows: Vec<(String, i64)> =
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(db_error)?.filter_map(Result::ok).collect();
        drop(stmt);
        let tx = conn.unchecked_transaction().map_err(db_error)?;
        for (key, size) in rows {
            if over <= 0 {
                break;
            }
            tx.execute("DELETE FROM pieces WHERE key = ?1", params![key]).map_err(db_error)?;
            over -= size;
        }
        tx.commit().map_err(db_error)?;
        Ok(())
    }

    pub fn totals(&self) -> Result<(i64, i64), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT COALESCE(SUM(size), 0), COUNT(*) FROM pieces", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(db_error)
    }

    fn meta(&self, name: &str) -> Result<i64, AppError> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row("SELECT value FROM meta WHERE name = ?1", params![name], |r| r.get(0))
            .optional()
            .map_err(db_error)?
            .unwrap_or(0))
    }

    fn set_meta(&self, name: &str, value: i64) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("INSERT OR REPLACE INTO meta (name, value) VALUES (?1, ?2)", params![name, value]).map_err(db_error)?;
        Ok(())
    }
}

// ---- the service --------------------------------------------------------------------------------------------------

/// A tile or range answer: the bytes, or the HTTP status the map screen gets instead (404 none, 503 not now).
#[derive(Debug, Clone, PartialEq)]
pub enum Answer {
    Data(Vec<u8>),
    Missing(u16),
}

pub struct MapCache<F: MapFetch> {
    store: MapStore,
    fetch: F,
    downloads: Semaphore,
    osm_base: String,
}

const BLOCKED_KEY: &str = "osm_blocked_until";

fn is_refusal(status: u16) -> bool {
    matches!(status, 403 | 418 | 429)
}

impl<F: MapFetch> MapCache<F> {
    pub fn new(store: MapStore, fetch: F) -> Self {
        MapCache { store, fetch, downloads: Semaphore::new(PARALLEL_DOWNLOADS), osm_base: OSM_TILE_URL.to_string() }
    }

    pub fn with_osm_base(mut self, base: &str) -> Self {
        self.osm_base = base.trim_end_matches('/').to_string();
        self
    }

    pub fn osm_blocked_until(&self) -> i64 {
        self.store.meta(BLOCKED_KEY).unwrap_or(0)
    }

    pub fn status(&self, settings: &MapSettings, now: i64) -> MapStatus {
        let blocked_until = self.osm_blocked_until();
        let (bytes, count) = self.store.totals().unwrap_or((0, 0));
        MapStatus {
            use_source: choose_source(settings, blocked_until > now).to_string(),
            pmtiles_url: if valid_pmtiles_url(&settings.pmtiles_url) { settings.pmtiles_url.clone() } else { String::new() },
            source_setting: settings.source.clone(),
            osm_blocked_until: blocked_until,
            cached_bytes: bytes,
            cached_pieces: count,
            max_bytes: self.store.max_bytes,
        }
    }

    /// One OpenStreetMap picture: from disk when fresh, else downloaded once and kept; the old copy when offline.
    pub async fn osm_tile(&self, z: u32, x: u32, y: u32, now: i64) -> Answer {
        if !valid_tile(z, x, y) {
            return Answer::Missing(404);
        }
        let key = format!("osm/{z}/{x}/{y}");
        let url = format!("{}/{z}/{x}/{y}.png", self.osm_base);
        self.cached_or_download(&key, &url, None, now, true, |b| b.starts_with(b"\x89PNG")).await
    }

    /// One byte range of the company's PMTiles file. `url` must be the file set by the provider.
    pub async fn pmtiles_range(&self, settings: &MapSettings, url: &str, offset: u64, length: u64, now: i64) -> Result<Answer, AppError> {
        if !valid_pmtiles_url(url) || url != settings.pmtiles_url {
            return Err(AppError::new("map_not_allowed", "This map file is not the one set for your company."));
        }
        if length == 0 || length > MAX_RANGE || offset.checked_add(length).is_none() {
            return Err(AppError::new("map_bad_range", "That part of the map file cannot be read."));
        }
        let key = format!("pm|{url}|{offset}|{length}");
        // a range never changes for the same file name; a new map is published under a new file name
        Ok(self.cached_or_download(&key, url, Some((offset, length)), now, false, |b| !b.is_empty()).await)
    }

    async fn cached_or_download(
        &self,
        key: &str,
        url: &str,
        range: Option<(u64, u64)>,
        now: i64,
        is_osm: bool,
        looks_right: impl Fn(&[u8]) -> bool,
    ) -> Answer {
        let stale = match self.store.get(key, now) {
            Ok(Some(p)) if !is_osm || now - p.fetched_at < REFRESH_AFTER => return Answer::Data(p.data),
            Ok(Some(p)) => Some(p.data),
            _ => None,
        };
        let fallback = |stale: Option<Vec<u8>>, status: u16| stale.map(Answer::Data).unwrap_or(Answer::Missing(status));
        if is_osm && self.osm_blocked_until() > now {
            return fallback(stale, 503);
        }
        let Ok(_permit) = self.downloads.acquire().await else {
            return fallback(stale, 503);
        };
        // another request may have fetched it while this one waited
        if stale.is_none() {
            if let Ok(Some(p)) = self.store.get(key, now) {
                return Answer::Data(p.data);
            }
        }
        match self.fetch.get(url, range).await {
            Ok((status, body)) if (status == 200 || status == 206) && looks_right(&body) => {
                if let Some((_, length)) = range {
                    if status != 206 || body.len() as u64 > length {
                        return fallback(stale, 502); // the storage ignored the range: do not keep a whole file
                    }
                }
                let _ = self.store.put(key, &body, now);
                Answer::Data(body)
            }
            Ok((status, _)) if is_osm && is_refusal(status) => {
                let _ = self.store.set_meta(BLOCKED_KEY, now + BLOCK_SECONDS);
                fallback(stale, 503)
            }
            Ok((404, _)) => fallback(stale, 404),
            Ok(_) | Err(_) => fallback(stale, 503),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nrest";

    #[derive(Default)]
    struct FakeFetch {
        answers: StdMutex<Vec<Result<(u16, Vec<u8>), FetchError>>>,
        calls: StdMutex<Vec<(String, Option<(u64, u64)>)>>,
    }

    impl FakeFetch {
        fn answering(list: Vec<Result<(u16, Vec<u8>), FetchError>>) -> Self {
            FakeFetch { answers: StdMutex::new(list), calls: StdMutex::new(vec![]) }
        }
        fn calls(&self) -> usize {
            self.calls.lock().unwrap().len()
        }
    }

    impl MapFetch for FakeFetch {
        async fn get(&self, url: &str, range: Option<(u64, u64)>) -> Result<(u16, Vec<u8>), FetchError> {
            self.calls.lock().unwrap().push((url.to_string(), range));
            let mut a = self.answers.lock().unwrap();
            if a.is_empty() {
                Err(FetchError::Network("no answer".into()))
            } else {
                a.remove(0)
            }
        }
    }

    fn cache(answers: Vec<Result<(u16, Vec<u8>), FetchError>>) -> MapCache<FakeFetch> {
        MapCache::new(MapStore::open_in_memory(DEFAULT_MAX_BYTES).unwrap(), FakeFetch::answering(answers))
    }

    fn pm(source: &str) -> MapSettings {
        MapSettings { source: source.into(), pmtiles_url: "https://maps.example.com/east-africa-2026.pmtiles".into() }
    }

    #[tokio::test]
    async fn a_seen_tile_comes_from_disk_without_downloading_again() {
        let c = cache(vec![Ok((200, PNG.to_vec()))]);
        assert_eq!(c.osm_tile(10, 1, 2, 1000).await, Answer::Data(PNG.to_vec()));
        assert_eq!(c.osm_tile(10, 1, 2, 2000).await, Answer::Data(PNG.to_vec()));
        assert_eq!(c.fetch.calls(), 1);
        assert_eq!(c.fetch.calls.lock().unwrap()[0].0, "https://tile.openstreetmap.org/10/1/2.png");
    }

    #[tokio::test]
    async fn an_old_tile_is_refreshed_and_kept_when_offline() {
        let c = cache(vec![Ok((200, PNG.to_vec()))]);
        c.osm_tile(5, 1, 1, 0).await;
        let later = REFRESH_AFTER + 10;
        assert_eq!(c.osm_tile(5, 1, 1, later).await, Answer::Data(PNG.to_vec())); // network failed: old copy
        assert_eq!(c.fetch.calls(), 2);
    }

    #[tokio::test]
    async fn offline_and_never_seen_answers_not_now() {
        let c = cache(vec![Err(FetchError::Network("offline".into()))]);
        assert_eq!(c.osm_tile(3, 1, 1, 0).await, Answer::Missing(503));
        assert_eq!(c.osm_tile(25, 1, 1, 0).await, Answer::Missing(404)); // bad zoom: no download
        assert_eq!(c.osm_tile(3, 8, 1, 0).await, Answer::Missing(404)); // x outside the zoom
        assert_eq!(c.fetch.calls(), 1);
    }

    #[tokio::test]
    async fn a_refusal_pauses_openstreetmap_and_auto_moves_to_protomaps() {
        let c = cache(vec![Ok((429, vec![])), Ok((200, PNG.to_vec()))]);
        assert_eq!(c.osm_tile(4, 1, 1, 100).await, Answer::Missing(503));
        assert_eq!(c.osm_blocked_until(), 100 + BLOCK_SECONDS);
        assert_eq!(c.osm_tile(4, 2, 2, 200).await, Answer::Missing(503)); // paused: nothing downloaded
        assert_eq!(c.fetch.calls(), 1);
        assert_eq!(c.status(&pm("auto"), 200).use_source, "protomaps");
        assert_eq!(state_word(&c.status(&pm("auto"), 200), 200), "protomaps");
        assert_eq!(c.status(&pm("osm"), 200).use_source, "osm");
        assert_eq!(state_word(&c.status(&pm("osm"), 200), 200), "osm_blocked");
        assert_eq!(c.status(&MapSettings::default(), 200).use_source, "osm"); // no file set: stays on OpenStreetMap
        // the pause ends by itself
        let after = 100 + BLOCK_SECONDS + 1;
        assert_eq!(c.status(&pm("auto"), after).use_source, "osm");
        assert_eq!(c.osm_tile(4, 2, 2, after).await, Answer::Data(PNG.to_vec()));
    }

    #[test]
    fn source_choice() {
        assert_eq!(choose_source(&pm("protomaps"), false), "protomaps");
        assert_eq!(choose_source(&pm("auto"), false), "osm");
        assert_eq!(choose_source(&MapSettings { source: "protomaps".into(), pmtiles_url: "".into() }, true), "osm");
        assert_eq!(choose_source(&MapSettings { source: "auto".into(), pmtiles_url: "http://x.com/a.pmtiles".into() }, true), "osm");
        assert!(valid_pmtiles_url("https://pub-1.r2.dev/maps/east-africa.pmtiles"));
        assert!(!valid_pmtiles_url("https://user:pw@x.com/a.pmtiles"));
        assert!(!valid_pmtiles_url("https://x.com/a.png"));
    }

    #[tokio::test]
    async fn protomaps_ranges_are_kept_and_only_the_company_file_is_read() {
        let s = pm("protomaps");
        let c = cache(vec![Ok((206, vec![7u8; 100])), Ok((200, vec![1u8; 5000]))]);
        let url = s.pmtiles_url.clone();
        assert_eq!(c.pmtiles_range(&s, &url, 0, 100, 1).await.unwrap(), Answer::Data(vec![7u8; 100]));
        assert_eq!(c.pmtiles_range(&s, &url, 0, 100, 2).await.unwrap(), Answer::Data(vec![7u8; 100]));
        assert_eq!(c.fetch.calls.lock().unwrap()[0].1, Some((0, 100)));
        // storage that ignores the range (200 with the whole file) is not kept
        assert_eq!(c.pmtiles_range(&s, &url, 100, 50, 3).await.unwrap(), Answer::Missing(502));
        assert_eq!(c.fetch.calls(), 2);
        assert_eq!(c.pmtiles_range(&s, "https://evil.com/a.pmtiles", 0, 10, 1).await.unwrap_err().code, "map_not_allowed");
        assert_eq!(c.pmtiles_range(&s, &url, 0, MAX_RANGE + 1, 1).await.unwrap_err().code, "map_bad_range");
        assert_eq!(c.pmtiles_range(&s, &url, 0, 0, 1).await.unwrap_err().code, "map_bad_range");
    }

    #[test]
    fn the_cache_stays_under_its_limit_dropping_least_used_first() {
        let store = MapStore::open_in_memory(1000).unwrap();
        store.put("a", &[0u8; 400], 1).unwrap();
        store.put("b", &[0u8; 400], 2).unwrap();
        store.get("a", 3).unwrap(); // a used recently
        store.put("c", &[0u8; 400], 4).unwrap();
        store.trim().unwrap();
        assert!(store.get("a", 5).unwrap().is_some());
        assert!(store.get("b", 5).unwrap().is_none());
        assert!(store.get("c", 5).unwrap().is_some());
        assert_eq!(store.totals().unwrap(), (800, 2));
    }

    #[test]
    fn tile_paths() {
        assert_eq!(parse_tile_path("/osm/3/1/2.png"), Some((3, 1, 2)));
        for bad in ["/osm/3/1/2.jpg", "/osm/3/1.png", "/osm/3/1/2/4.png", "/osm/20/1/1.png", "/osm/1/2/0.png", "/x/1/0/0.png", "/osm/a/0/0.png"] {
            assert_eq!(parse_tile_path(bad), None, "{bad}");
        }
    }
}
