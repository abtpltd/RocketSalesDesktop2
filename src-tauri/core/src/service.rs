//! The desktop session: sign in, keep the access token fresh, fetch dashboard/menu, fall back to the
//! encrypted offline copy, and wipe everything on sign-out or when the server switches the computer off.
use crate::api::{map_transport_error, parse_envelope, HttpRequest, Method, Transport, TransportError};
use crate::cache::{Lookup, OfflineCache};
use crate::clock::Clock;
use crate::config::Config;
use crate::errors::AppError;
use crate::map::MapSettings;
use crate::secrets::SecretStore;
use crate::syncstore::{self, LocalCopy, View};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use url::Url;

const REFRESH_SECRET: &str = "refresh";
const SESSION_KIND: &str = "session";
const DAY: i64 = 86_400;
const ACCESS_SLACK: i64 = 30;
pub const DASHBOARD_TIMEOUT: Duration = Duration::from_secs(120);
const NORMAL_TIMEOUT: Duration = Duration::from_secs(30);

/// Sorting, filtering and export for list and report grids. Every field is optional; the server works on all rows
/// (not only the page) when any of them is set.
#[derive(Debug, Default, Clone)]
pub struct GridOpts {
    pub sort: String,
    pub desc: bool,
    pub manager: String,
    pub app_user: String,
    pub export: bool,
}

impl GridOpts {
    fn append(&self, ser: &mut url::form_urlencoded::Serializer<String>) {
        let clip = |v: &str, n: usize| v.trim().chars().take(n).collect::<String>();
        if !self.sort.trim().is_empty() {
            ser.append_pair("sort", &clip(&self.sort, 60));
            if self.desc {
                ser.append_pair("desc", "1");
            }
        }
        if !self.manager.trim().is_empty() {
            ser.append_pair("manager", &clip(&self.manager, 120));
        }
        if !self.app_user.trim().is_empty() {
            ser.append_pair("app_user", &clip(&self.app_user, 120));
        }
        if self.export {
            ser.append_pair("export", "1");
        }
    }
}
const LOGOUT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserInfo {
    pub name: String,
    pub email: String,
    pub role: String,
    pub is_admin: bool,
    /// the provider has stopped this role from copying and printing inside the app
    #[serde(default)]
    pub copy_blocked: bool,
    /// the provider lets this person's window be screen-shared (the window is hidden from capture otherwise)
    #[serde(default)]
    pub share_allowed: bool,
    /// the provider has switched "What is new" on for this person (off when the server does not say, e.g. an older server)
    #[serde(default)]
    pub news_allowed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CompanyInfo {
    pub domain: String,
    pub title: String,
    pub country: String,
    pub currency: String,
}

#[derive(Debug, Clone, Deserialize)]
struct LoginData {
    access_token: String,
    access_expires_at: i64,
    refresh_token: String,
    refresh_expires_at: i64,
    user: UserInfo,
    company: CompanyInfo,
    offline_days: i64,
    /// the provider's map setting for this company (older servers send none: OpenStreetMap)
    #[serde(default)]
    map: MapSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredRefresh {
    company: String,
    /// the server this sign-in belongs to (older saved sign-ins have none and use the default pattern)
    #[serde(default)]
    base_url: Option<String>,
    email: String,
    refresh_token: String,
    refresh_expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionMeta {
    user: UserInfo,
    company: CompanyInfo,
    offline_days: i64,
    #[serde(default)]
    map: MapSettings,
}

#[derive(Debug, Clone)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SessionInfo {
    pub user: UserInfo,
    pub company: CompanyInfo,
    pub offline_days: i64,
    pub offline: bool,
    pub base_url: String,
    pub map: MapSettings,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Fetched {
    pub data: Value,
    /// "server" or "offline"
    pub source: String,
    pub saved_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Dashboard,
    Menu,
}

struct Active {
    company: String,
    email: String,
    base: Url,
    refresh_token: String,
    access: Option<(String, i64)>,
    meta: SessionMeta,
    offline: bool,
}

enum CallError {
    Transport(TransportError),
    Api(AppError),
}

impl CallError {
    fn into_app(self) -> AppError {
        match self {
            CallError::Transport(t) => map_transport_error(&t),
            CallError::Api(e) => e,
        }
    }
}

pub struct Desktop<T: Transport> {
    transport: T,
    clock: Arc<dyn Clock>,
    secrets: Arc<dyn SecretStore>,
    cache: OfflineCache,
    config: Config,
    device: DeviceInfo,
    /// this computer's signing key (None when the credential store cannot be used)
    key: Option<crate::devicekey::DeviceKey>,
    state: Mutex<Option<Active>>,
    refresh_lock: Mutex<()>,
    /// The signed-in role may not keep offline copies (menu desktop_access.settings.offline == false).
    no_offline: std::sync::atomic::AtomicBool,
    /// what the map screen last used ("osm", "protomaps", "osm_blocked"); sent with the next refresh
    map_state: std::sync::Mutex<String>,
}

fn owner(company: &str, email: &str) -> String {
    format!("{company}|{email}")
}

fn bad_answer() -> AppError {
    AppError::new("unsupported", "The server sent an answer this version of the app does not understand.")
}

impl<T: Transport> Desktop<T> {
    pub fn new(
        transport: T,
        clock: Arc<dyn Clock>,
        secrets: Arc<dyn SecretStore>,
        cache: OfflineCache,
        config: Config,
        device: DeviceInfo,
    ) -> Self {
        let key = crate::devicekey::DeviceKey::load_or_create(secrets.as_ref()).ok();
        Desktop { transport, clock, secrets, cache, config, device, key, state: Mutex::new(None), refresh_lock: Mutex::new(()), no_offline: std::sync::atomic::AtomicBool::new(false), map_state: std::sync::Mutex::new(String::new()) }
    }

    pub fn device(&self) -> &DeviceInfo {
        &self.device
    }

    /// Notes which map source this computer uses; the server hears it with the next refresh (no extra request).
    pub fn set_map_state(&self, state: &str) {
        if matches!(state, "osm" | "protomaps" | "osm_blocked") {
            *self.map_state.lock().unwrap() = state.to_string();
        }
    }

    fn refresh_body(&self, company: &str, refresh_token: &str) -> Value {
        let state = self.map_state.lock().unwrap().clone();
        let mut body = if state.is_empty() {
            json!({ "refresh_token": refresh_token })
        } else {
            json!({ "refresh_token": refresh_token, "map_state": state })
        };
        if let Some(key) = &self.key {
            let id = self.device.id.clone();
            let company = company.to_string();
            crate::devicekey::merge(&mut body, key.fields(|ts| crate::devicekey::refresh_message(&company, &id, ts), self.clock.now()));
        }
        body
    }

    // ---- low level -----------------------------------------------------------------------------
    async fn send(
        &self,
        method: Method,
        base: &Url,
        path: &str,
        bearer: Option<String>,
        body: Option<Value>,
        timeout: Duration,
    ) -> Result<Value, CallError> {
        let url = base.join(path).map_err(|_| CallError::Api(AppError::new("bad_config", "Bad server address.")))?;
        let request = HttpRequest { method, url: url.to_string(), bearer, json_body: body, timeout };
        let response = self.transport.send(request).await.map_err(CallError::Transport)?;
        parse_envelope(&response).map_err(CallError::Api)
    }

    fn stored_refresh(&self) -> Result<Option<StoredRefresh>, AppError> {
        Ok(self.secrets.get(REFRESH_SECRET)?.and_then(|text| serde_json::from_str(&text).ok()))
    }

    async fn wipe_all(&self) {
        let _ = self.secrets.delete(REFRESH_SECRET);
        let _ = self.cache.wipe();
        *self.state.lock().await = None;
    }

    /// Server answers that mean "this sign-in is over". A switched-off computer also loses its offline copy.
    async fn session_ended(&self, error: AppError) -> AppError {
        match error.code.as_str() {
            "device_revoked" => {
                self.wipe_all().await;
                error
            }
            "token_invalid" | "token_expired" | "wrong_company" | "account_blocked" | "company_not_enabled"
            | "device_pending" | "device_key_invalid" => {
                let _ = self.secrets.delete(REFRESH_SECRET);
                *self.state.lock().await = None;
                if error.code == "token_invalid" || error.code == "token_expired" {
                    AppError::new("session_expired", "Your sign-in has expired. Please sign in again.")
                } else {
                    error
                }
            }
            _ => error,
        }
    }

    /// The thought of the day for the sign-in screen. It needs no sign-in and is the same for every company, so it is
    /// asked from the company typed in, else the last company used, else the provider's own address.
    pub async fn thought(&self, company: Option<&str>) -> Result<Value, AppError> {
        let typed = company.map(str::trim).filter(|c| !c.is_empty()).map(str::to_string);
        let input = match typed {
            Some(c) => c,
            None => self.stored_refresh().ok().flatten().map(|s| s.company).unwrap_or_else(|| "superadmin".to_string()),
        };
        let (_, base) = self.config.resolve(&input)?;
        self.send(Method::Get, &base, "/api/v1/desktop/thought", None, None, NORMAL_TIMEOUT)
            .await
            .map_err(CallError::into_app)
    }

    /// The company's name and logo for the sign-in screen (no sign-in needed). It is asked from the company typed in,
    /// else the last company used; with neither there is nothing to show.
    pub async fn brand(&self, company: Option<&str>) -> Result<Value, AppError> {
        let typed = company.map(str::trim).filter(|c| !c.is_empty()).map(str::to_string);
        let input = match typed.or_else(|| self.stored_refresh().ok().flatten().map(|s| s.company)) {
            Some(c) => c,
            None => return Ok(json!({ "company": "", "logo": "" })),
        };
        let (_, base) = self.config.resolve(&input)?;
        self.send(Method::Get, &base, "/api/v1/desktop/brand", None, None, NORMAL_TIMEOUT)
            .await
            .map_err(CallError::into_app)
    }

    /// Sets (or, with an empty string, removes) the company logo; only administrators may.
    pub async fn save_brand(&self, logo: &str) -> Result<Value, AppError> {
        if logo.len() > 300_000 {
            return Err(AppError::new("bad_request", "The logo is too large. Use an image under 200 KB."));
        }
        self.live(Method::Post, "/api/v1/desktop/brand".to_string(), Some(json!({ "logo": logo }))).await
    }

    // ---- sign in -------------------------------------------------------------------------------
    pub async fn login(&self, company: &str, email: &str, password: &str) -> Result<SessionInfo, AppError> {
        let (company, base) = self.config.resolve(company)?;
        let email = email.trim().to_string();
        if email.is_empty() || password.is_empty() {
            return Err(AppError::new("bad_request", "Enter your email and password."));
        }
        let mut body = json!({
            "company": company, "email": email, "password": password,
            "device_id": self.device.id, "device_name": self.device.name, "app_version": self.device.app_version,
        });
        if let Some(key) = &self.key {
            let (c, e, id) = (company.clone(), email.clone(), self.device.id.clone());
            crate::devicekey::merge(&mut body, key.fields(|ts| crate::devicekey::login_message(&c, &e, &id, ts), self.clock.now()));
        }
        let value = self
            .send(Method::Post, &base, "/api/v1/desktop/login", None, Some(body), NORMAL_TIMEOUT)
            .await
            .map_err(CallError::into_app)?;
        let data: LoginData = serde_json::from_value(value).map_err(|_| bad_answer())?;
        self.adopt(company, base, data).await
    }

    /// Takes a successful login/refresh answer: saves the refresh token, renews the offline session record,
    /// and makes the session active. A different user or company starts from an empty offline copy.
    async fn adopt(&self, company: String, base: Url, data: LoginData) -> Result<SessionInfo, AppError> {
        let email = data.user.email.clone();
        let same_identity = self
            .stored_refresh()?
            .map(|s| s.company == company && s.email == email)
            .unwrap_or(true);
        if !same_identity {
            self.cache.wipe()?;
        }
        let stored = StoredRefresh {
            company: company.clone(),
            base_url: Some(base.to_string()),
            email: email.clone(),
            refresh_token: data.refresh_token.clone(),
            refresh_expires_at: data.refresh_expires_at,
        };
        self.secrets.set(REFRESH_SECRET, &serde_json::to_string(&stored).map_err(|e| AppError::internal(e.to_string()))?)?;
        let meta = SessionMeta { user: data.user.clone(), company: data.company.clone(), offline_days: data.offline_days, map: data.map.clone() };
        let now = self.clock.now();
        let meta_bytes = serde_json::to_vec(&meta).map_err(|e| AppError::internal(e.to_string()))?;
        self.cache.put(SESSION_KIND, &owner(&company, &email), now, now + data.offline_days * DAY, &meta_bytes)?;
        let info = SessionInfo {
            user: meta.user.clone(),
            company: meta.company.clone(),
            offline_days: meta.offline_days,
            offline: false,
            base_url: base.to_string(),
            map: meta.map.clone(),
        };
        *self.state.lock().await = Some(Active {
            company,
            email,
            base,
            refresh_token: data.refresh_token,
            access: Some((data.access_token, data.access_expires_at)),
            meta,
            offline: false,
        });
        Ok(info)
    }

    /// App start: continue the saved sign-in. Offline, the session continues from the encrypted copy
    /// for as long as it has not expired.
    pub async fn restore(&self) -> Result<Option<SessionInfo>, AppError> {
        let Some(stored) = self.stored_refresh()? else {
            return Ok(None);
        };
        let base = match stored.base_url.as_deref() {
            Some(saved) => self.config.check_stored(&stored.company, saved)?,
            None => self.config.base_url(&stored.company)?,
        };
        let body = self.refresh_body(&stored.company, &stored.refresh_token);
        match self.send(Method::Post, &base, "/api/v1/desktop/refresh", None, Some(body), NORMAL_TIMEOUT).await {
            Ok(value) => {
                let data: LoginData = serde_json::from_value(value).map_err(|_| bad_answer())?;
                Ok(Some(self.adopt(stored.company, base, data).await?))
            }
            Err(CallError::Api(e)) => Err(self.session_ended(e).await),
            Err(CallError::Transport(t)) => {
                let now = self.clock.now();
                match self.cache.get(SESSION_KIND, &owner(&stored.company, &stored.email), now)? {
                    Lookup::Fresh(cached) => {
                        let meta: SessionMeta = serde_json::from_slice(&cached.data).map_err(|_| AppError::offline())?;
                        let info = SessionInfo {
                            user: meta.user.clone(),
                            company: meta.company.clone(),
                            offline_days: meta.offline_days,
                            offline: true,
                            base_url: base.to_string(),
                            map: meta.map.clone(),
                        };
                        *self.state.lock().await = Some(Active {
                            company: stored.company,
                            email: stored.email,
                            base,
                            refresh_token: stored.refresh_token,
                            access: None,
                            meta,
                            offline: true,
                        });
                        Ok(Some(info))
                    }
                    Lookup::Expired => Err(AppError::offline_expired()),
                    Lookup::Missing => Err(match t {
                        TransportError::Offline(_) => AppError::offline(),
                        other => map_transport_error(&other),
                    }),
                }
            }
        }
    }

    pub async fn session_info(&self) -> Option<SessionInfo> {
        self.state.lock().await.as_ref().map(|a| SessionInfo {
            user: a.meta.user.clone(),
            company: a.meta.company.clone(),
            offline_days: a.meta.offline_days,
            offline: a.offline,
            base_url: a.base.to_string(),
            map: a.meta.map.clone(),
        })
    }

    // ---- tokens --------------------------------------------------------------------------------
    async fn valid_access(&self) -> Option<String> {
        let guard = self.state.lock().await;
        let active = guard.as_ref()?;
        let (token, expires_at) = active.access.as_ref()?;
        (*expires_at - self.clock.now() > ACCESS_SLACK).then(|| token.clone())
    }

    async fn refresh_access(&self, force: bool) -> Result<String, CallError> {
        let _serial = self.refresh_lock.lock().await;
        if !force {
            if let Some(token) = self.valid_access().await {
                return Ok(token);
            }
        }
        let (company, base, refresh_token) = {
            let guard = self.state.lock().await;
            let active = guard.as_ref().ok_or_else(|| CallError::Api(AppError::new("session_expired", "Please sign in.")))?;
            (active.company.clone(), active.base.clone(), active.refresh_token.clone())
        };
        let body = self.refresh_body(&company, &refresh_token);
        match self.send(Method::Post, &base, "/api/v1/desktop/refresh", None, Some(body), NORMAL_TIMEOUT).await {
            Ok(value) => {
                let data: LoginData = serde_json::from_value(value).map_err(|_| CallError::Api(bad_answer()))?;
                let token = data.access_token.clone();
                self.adopt(company, base, data).await.map_err(CallError::Api)?;
                Ok(token)
            }
            Err(CallError::Api(e)) => Err(CallError::Api(self.session_ended(e).await)),
            Err(other) => Err(other),
        }
    }

    async fn online_get(&self, path: &str, timeout: Duration) -> Result<Value, CallError> {
        self.online_call(Method::Get, path, None, timeout).await
    }

    async fn online_call(&self, method: Method, path: &str, body: Option<Value>, timeout: Duration) -> Result<Value, CallError> {
        let base = {
            let guard = self.state.lock().await;
            guard.as_ref().ok_or_else(|| CallError::Api(AppError::new("session_expired", "Please sign in.")))?.base.clone()
        };
        let token = match self.valid_access().await {
            Some(token) => token,
            None => self.refresh_access(false).await?,
        };
        match self.send(method.clone(), &base, path, Some(token), body.clone(), timeout).await {
            Err(CallError::Api(e)) if e.code == "token_expired" || e.code == "token_invalid" => {
                let token = self.refresh_access(true).await?;
                self.send(method, &base, path, Some(token), body, timeout).await
            }
            other => other,
        }
    }

    /// Changes need a live connection: they are never queued or answered from the saved copy.
    async fn live(&self, method: Method, path: String, body: Option<Value>) -> Result<Value, AppError> {
        match self.online_call(method, &path, body, NORMAL_TIMEOUT).await {
            Ok(value) => Ok(value),
            Err(CallError::Transport(_)) => Err(AppError::new(
                "offline",
                "You are offline. Adding or changing records needs a connection to the server.",
            )),
            Err(CallError::Api(e)) => Err(self.session_ended(e).await),
        }
    }

    /// The fields of an add/edit form (and the saved values when `key` is given).
    pub async fn fetch_form(&self, name: &str, key: &str) -> Result<Value, AppError> {
        check_name(name)?;
        let query = url::form_urlencoded::Serializer::new(String::new()).append_pair("key", key.trim()).finish();
        self.live(Method::Get, format!("/api/v1/desktop/form/{name}?{query}"), None).await
    }

    /// Runs a one-click action (approve, hold, cancel) through the server, which allows only what the web allows.
    pub async fn run_action(&self, name: &str, body: Value) -> Result<Value, AppError> {
        check_name(name)?;
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to do."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/action/{name}"), Some(body)).await
    }

    /// The products of an order or quotation for editing (or one base price list when `base_price` is given).
    pub async fn fetch_order_edit(&self, kind: &str, key: &str, base_price: &str) -> Result<Value, AppError> {
        check_name(kind)?;
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("kind", kind)
            .append_pair("key", key.trim())
            .append_pair("base_price", &base_price.trim().chars().take(100).collect::<String>())
            .finish();
        self.live(Method::Get, format!("/api/v1/desktop/order_edit?{query}"), None).await
    }

    /// A form designer (survey forms, rocket form masters, question banks): the list, or one record by key.
    pub async fn fetch_designer(&self, name: &str, key: &str) -> Result<Value, AppError> {
        check_name(name)?;
        let query = url::form_urlencoded::Serializer::new(String::new()).append_pair("key", key.trim()).finish();
        self.live(Method::Get, format!("/api/v1/desktop/designer/{name}?{query}"), None).await
    }

    /// Saves a design; the server checks it and runs the web page's own save.
    pub async fn save_designer(&self, name: &str, body: Value) -> Result<Value, AppError> {
        check_name(name)?;
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/designer/{name}"), Some(body)).await
    }

    /// A field-app setup page (App Promo, App Training, App User Settings).
    pub async fn fetch_setup(&self, name: &str) -> Result<Value, AppError> {
        check_name(name)?;
        self.live(Method::Get, format!("/api/v1/desktop/setup/{name}"), None).await
    }

    /// Counts of things waiting for this person (the bell), read live. Older servers answer 404.
    pub async fn fetch_notifications(&self) -> Result<Value, AppError> {
        self.live(Method::Get, "/api/v1/desktop/notifications".to_string(), None).await
    }

    /// Customer / doctor 360 view, read live (it is never kept offline).
    pub async fn fetch_profile(&self, kind: &str, key: &str) -> Result<Value, AppError> {
        if kind != "customer" && kind != "doctor" {
            return Err(AppError::new("bad_request", "Unknown record type."));
        }
        let query = url::form_urlencoded::Serializer::new(String::new()).append_pair("key", &key.chars().take(500).collect::<String>()).finish();
        self.live(Method::Get, format!("/api/v1/desktop/profile/{kind}?{query}"), None).await
    }

    /// The editable pipeline board, read live.
    pub async fn fetch_pipeline(&self, q: Option<&str>) -> Result<Value, AppError> {
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("q", &q.unwrap_or("").chars().take(200).collect::<String>())
            .finish();
        self.live(Method::Get, format!("/api/v1/desktop/pipeline?{query}"), None).await
    }

    /// One pipeline change; the server checks it and runs the web page's own save.
    pub async fn pipeline_act(&self, body: Value) -> Result<Value, AppError> {
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Unknown pipeline change."));
        }
        self.live(Method::Post, "/api/v1/desktop/pipeline".to_string(), Some(body)).await
    }

    /// Touch base from the 360 view: log a call / WhatsApp / email / note, or ask a rep to visit.
    pub async fn touch_base(&self, kind: &str, body: Value) -> Result<Value, AppError> {
        if (kind != "customer" && kind != "doctor") || !body.is_object() {
            return Err(AppError::new("bad_request", "Unknown record type."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/profile/{kind}"), Some(body)).await
    }

    /// Saves a setup page; the server checks it and runs the web page's own save.
    pub async fn save_setup(&self, name: &str, body: Value) -> Result<Value, AppError> {
        check_name(name)?;
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/setup/{name}"), Some(body)).await
    }

    /// One editable grid (targets, limits, distances, prices) with its filters.
    pub async fn fetch_grid(&self, name: &str, params: std::collections::BTreeMap<String, String>) -> Result<Value, AppError> {
        check_name(name)?;
        let query = {
            let mut q = url::form_urlencoded::Serializer::new(String::new());
            for (k, v) in params.iter().filter(|(k, _)| matches!(k.as_str(), "month" | "rep" | "supplier" | "base_price")) {
                q.append_pair(k, &v.chars().take(120).collect::<String>());
            }
            q.finish()
        };
        self.live(Method::Get, format!("/api/v1/desktop/grid/{name}?{query}"), None).await
    }

    /// Saves changed grid cells; the server checks them and runs the web page's own save.
    pub async fn save_grid(&self, name: &str, body: Value) -> Result<Value, AppError> {
        check_name(name)?;
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/grid/{name}"), Some(body)).await
    }

    /// A rep's gift / sample stock request, for approving it.
    pub async fn fetch_stock_request(&self, key: &str) -> Result<Value, AppError> {
        let query = url::form_urlencoded::Serializer::new(String::new()).append_pair("key", key.trim()).finish();
        self.live(Method::Get, format!("/api/v1/desktop/stock_request?{query}"), None).await
    }

    /// Approves a stock request and moves the stock (the server refuses one already approved).
    pub async fn approve_stock_request(&self, body: Value) -> Result<Value, AppError> {
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, "/api/v1/desktop/stock_request".to_string(), Some(body)).await
    }

    /// A page that sends or uploads (push notifications, file uploads): what it needs to show.
    pub async fn fetch_tool(&self, name: &str) -> Result<Value, AppError> {
        check_name(name)?;
        self.live(Method::Get, format!("/api/v1/desktop/tool/{name}"), None).await
    }

    /// Checks (dry run), saves or sends through the server, which runs the web page's own handler once.
    pub async fn save_tool(&self, name: &str, body: Value) -> Result<Value, AppError> {
        check_name(name)?;
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/tool/{name}"), Some(body)).await
    }

    /// Items, stores and reps for receiving or allocating gift / sample stock.
    pub async fn fetch_stock_doc(&self, kind: &str) -> Result<Value, AppError> {
        check_name(kind)?;
        self.live(Method::Get, format!("/api/v1/desktop/stock_doc/{kind}"), None).await
    }

    /// Saves a Stock IN or allocation; the server checks every line and runs the web page's own save.
    pub async fn save_stock_doc(&self, kind: &str, body: Value) -> Result<Value, AppError> {
        check_name(kind)?;
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/stock_doc/{kind}"), Some(body)).await
    }

    /// Saves edited order or quotation lines; the server prices them and runs the web page's own save.
    pub async fn save_order_edit(&self, body: Value) -> Result<Value, AppError> {
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, "/api/v1/desktop/order_edit".to_string(), Some(body)).await
    }

    /// Saves a form through the server (which runs the web page's own handler). Never deletes.
    pub async fn submit_form(&self, name: &str, body: Value) -> Result<Value, AppError> {
        check_name(name)?;
        if !body.is_object() {
            return Err(AppError::new("bad_request", "Nothing to save."));
        }
        self.live(Method::Post, format!("/api/v1/desktop/form/{name}"), Some(body)).await
    }

    // ---- data ----------------------------------------------------------------------------------
    /// A read-only master data list (products, customers, doctors) with the search, page and status the screen asks for.
    pub async fn fetch_list(
        &self,
        module: &str,
        search: &str,
        page: u32,
        size: u32,
        status: &str,
    ) -> Result<Fetched, AppError> {
        if module.is_empty() || !module.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
            return Err(AppError::new("bad_request", "Unknown list."));
        }
        self.fetch_list_with(module, search, page, size, status, &GridOpts::default()).await
    }

    pub async fn fetch_list_with(
        &self,
        module: &str,
        search: &str,
        page: u32,
        size: u32,
        status: &str,
        grid: &GridOpts,
    ) -> Result<Fetched, AppError> {
        if module.is_empty() || !module.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
            return Err(AppError::new("bad_request", "Unknown list."));
        }
        // built in a block so the serializer is gone before the request (it cannot cross an await)
        let query = {
            let mut ser = url::form_urlencoded::Serializer::new(String::new());
            ser.append_pair("q", search.trim())
                .append_pair("page", &page.max(1).to_string())
                .append_pair("size", &size.clamp(1, 500).to_string())
                .append_pair("status", status.trim());
            grid.append(&mut ser);
            ser.finish()
        };
        let path = format!("/api/v1/desktop/master/{module}?{query}");
        // the saved copy is kept per list, search and page so going offline shows what was last seen
        let cache_kind = format!("master:{module}:{query}");
        self.fetch_path(path, cache_kind, NORMAL_TIMEOUT).await
    }

    /// The saved mapping of one sales rep (HQ, areas, codes) for customers or doctors, plus the list of reps.
    pub async fn fetch_mapping(&self, rep: &str, kind: &str) -> Result<Fetched, AppError> {
        let kind = if kind == "doctor" { "doctor" } else { "customer" };
        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("rep", rep.trim())
            .append_pair("kind", kind)
            .finish();
        let path = format!("/api/v1/desktop/master/mapping?{query}");
        self.fetch_path(path, format!("master:mapping:{query}"), NORMAL_TIMEOUT).await
    }

    /// The read-only Orders list for a date range (empty dates mean the current month, decided by the server).
    pub async fn fetch_orders(
        &self,
        from: &str,
        to: &str,
        status: &str,
        search: &str,
        page: u32,
        size: u32,
    ) -> Result<Fetched, AppError> {
        self.fetch_orders_with(from, to, status, search, page, size, &GridOpts::default()).await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn fetch_orders_with(
        &self,
        from: &str,
        to: &str,
        status: &str,
        search: &str,
        page: u32,
        size: u32,
        grid: &GridOpts,
    ) -> Result<Fetched, AppError> {
        let query = {
            let mut ser = url::form_urlencoded::Serializer::new(String::new());
            ser.append_pair("from", from.trim())
                .append_pair("to", to.trim())
                .append_pair("status", status.trim())
                .append_pair("q", search.trim())
                .append_pair("page", &page.max(1).to_string())
                .append_pair("size", &size.clamp(1, 500).to_string());
            grid.append(&mut ser);
            ser.finish()
        };
        let path = format!("/api/v1/desktop/orders?{query}");
        self.fetch_path(path, format!("orders:{query}"), NORMAL_TIMEOUT).await
    }

    /// One order, read only. The key is the opaque text the Orders list gave us.
    pub async fn fetch_order(&self, key: &str) -> Result<Fetched, AppError> {
        self.fetch_order_of(key, "").await
    }

    /// One order, or one quotation when `kind` is "quotation".
    pub async fn fetch_order_of(&self, key: &str, kind: &str) -> Result<Fetched, AppError> {
        let kind = match kind {
            "quotation" => "quotation",
            "transfer" => "transfer",
            _ => "",
        };
        let key = key.trim();
        if key.is_empty() || key.len() > 500 || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '=') {
            return Err(AppError::new("bad_request", "Unknown order."));
        }
        let query = {
            let mut ser = url::form_urlencoded::Serializer::new(String::new());
            ser.append_pair("key", key);
            if !kind.is_empty() {
                ser.append_pair("kind", kind);
            }
            ser.finish()
        };
        self.fetch_path(format!("/api/v1/desktop/order?{query}"), format!("order:{kind}:{key}"), NORMAL_TIMEOUT).await
    }

    /// A read-only report for a date range, with optional search and paging for long reports. The name is checked
    /// here; the server checks the role and the menu.
    pub async fn fetch_report(
        &self,
        name: &str,
        from: &str,
        to: &str,
        search: &str,
        rep: &str,
        kind: &str,
        page: u32,
        size: u32,
    ) -> Result<Fetched, AppError> {
        self.fetch_report_with(name, from, to, search, rep, kind, page, size, &GridOpts::default()).await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn fetch_report_with(
        &self,
        name: &str,
        from: &str,
        to: &str,
        search: &str,
        rep: &str,
        kind: &str,
        page: u32,
        size: u32,
        grid: &GridOpts,
    ) -> Result<Fetched, AppError> {
        check_name(name)?;
        let query = {
            let mut ser = url::form_urlencoded::Serializer::new(String::new());
            ser.append_pair("from", from.trim())
                .append_pair("to", to.trim())
                .append_pair("q", search.trim())
                .append_pair("rep", &rep.trim().chars().take(500).collect::<String>())
                .append_pair("kind", &kind.trim().chars().take(10).collect::<String>())
                .append_pair("page", &page.max(1).to_string())
                .append_pair("size", &size.clamp(1, 500).to_string());
            grid.append(&mut ser);
            ser.finish()
        };
        self.fetch_path(format!("/api/v1/desktop/report/{name}?{query}"), format!("report:{name}:{query}"), NORMAL_TIMEOUT)
            .await
    }

    /// What this computer already holds for a report (any date range or filter), newest first, without asking the
    /// server. The assistant answers from these. Empty when nothing is saved or this role may not keep offline copies.
    pub async fn saved_reports(&self, name: &str) -> Result<Vec<Fetched>, AppError> {
        check_name(name)?;
        let who = {
            let guard = self.state.lock().await;
            let active = guard.as_ref().ok_or_else(|| AppError::new("session_expired", "Please sign in."))?;
            owner(&active.company, &active.email)
        };
        let found = self.cache.list_prefix(&format!("report:{name}:"), &who, self.clock.now())?;
        Ok(found
            .into_iter()
            .filter_map(|(_, c)| {
                serde_json::from_slice::<Value>(&c.data)
                    .ok()
                    .map(|data| Fetched { data, source: "offline".to_string(), saved_at: c.saved_at })
            })
            .collect())
    }

    /// The company's assistant settings (set by the administrator). A server that does not have them yet answers with
    /// "not found": the assistant then runs on its built-in defaults.
    pub async fn assistant(&self) -> Result<Value, AppError> {
        match self.online_get("/api/v1/desktop/assistant", NORMAL_TIMEOUT).await {
            Ok(v) => Ok(v),
            Err(CallError::Transport(t)) => Err(map_transport_error(&t)),
            Err(CallError::Api(e)) => Err(e),
        }
    }

    pub async fn save_assistant(&self, settings: Value) -> Result<Value, AppError> {
        if settings.to_string().len() > 20_000 {
            return Err(AppError::new("bad_request", "The assistant settings are too large."));
        }
        self.live(Method::Post, "/api/v1/desktop/assistant".to_string(), Some(settings)).await
    }

    /// The company's joint-call settings (who may take part, how a visit is confirmed). Any signed-in user may read them.
    pub async fn joint(&self) -> Result<Value, AppError> {
        match self.online_get("/api/v1/desktop/joint", NORMAL_TIMEOUT).await {
            Ok(v) => Ok(v),
            Err(CallError::Transport(t)) => Err(map_transport_error(&t)),
            Err(CallError::Api(e)) => Err(e),
        }
    }

    pub async fn save_joint(&self, settings: Value) -> Result<Value, AppError> {
        if settings.to_string().len() > 5_000 {
            return Err(AppError::new("bad_request", "The joint-call settings are too large."));
        }
        self.live(Method::Post, "/api/v1/desktop/joint".to_string(), Some(settings)).await
    }

    pub async fn fetch(&self, kind: Kind, month: Option<&str>) -> Result<Fetched, AppError> {
        let (path, cache_kind, timeout) = match kind {
            Kind::Dashboard => match month.filter(|m| !m.is_empty()) {
                Some(m) if !is_month(m) => return Err(AppError::new("bad_request", "Unknown month.")),
                Some(m) => (format!("/api/v1/desktop/dashboard?month={m}"), format!("dashboard:{m}"), DASHBOARD_TIMEOUT),
                None => ("/api/v1/desktop/dashboard".to_string(), "dashboard".to_string(), DASHBOARD_TIMEOUT),
            },
            Kind::Menu => ("/api/v1/desktop/menu".to_string(), "menu".to_string(), NORMAL_TIMEOUT),
        };
        self.fetch_path(path, cache_kind, timeout).await
    }

    async fn fetch_path(&self, path: String, cache_kind: String, timeout: Duration) -> Result<Fetched, AppError> {
        let (who, offline_days) = {
            let guard = self.state.lock().await;
            let active = guard.as_ref().ok_or_else(|| AppError::new("session_expired", "Please sign in."))?;
            (owner(&active.company, &active.email), active.meta.offline_days)
        };
        match self.online_get(&path, timeout).await {
            Ok(value) => {
                let now = self.clock.now();
                use std::sync::atomic::Ordering;
                if cache_kind == "menu" {
                    let blocked = value.pointer("/desktop_access/settings/offline") == Some(&Value::Bool(false));
                    self.no_offline.store(blocked, Ordering::SeqCst);
                    if blocked {
                        let _ = self.cache.clear_owner_except(&who, &[SESSION_KIND, "menu"]);
                    }
                }
                if cache_kind == "menu" || !self.no_offline.load(Ordering::SeqCst) {
                    if let Ok(bytes) = serde_json::to_vec(&value) {
                        let _ = self.cache.put(&cache_kind, &who, now, now + offline_days * DAY, &bytes);
                    }
                }
                if let Some(active) = self.state.lock().await.as_mut() {
                    active.offline = false;
                }
                Ok(Fetched { data: value, source: "server".to_string(), saved_at: now })
            }
            Err(CallError::Transport(t)) => self.from_cache(&cache_kind, &who, map_transport_error(&t)).await,
            Err(CallError::Api(e)) if e.code == "server_error" => self.from_cache(&cache_kind, &who, e).await,
            Err(CallError::Api(e)) => Err(self.session_ended(e).await),
        }
    }

    async fn from_cache(&self, cache_kind: &str, who: &str, why: AppError) -> Result<Fetched, AppError> {
        match self.cache.get(cache_kind, who, self.clock.now())? {
            Lookup::Fresh(cached) => {
                let data: Value = serde_json::from_slice(&cached.data).map_err(|_| why.clone())?;
                if let Some(active) = self.state.lock().await.as_mut() {
                    active.offline = true;
                }
                Ok(Fetched { data, source: "offline".to_string(), saved_at: cached.saved_at })
            }
            Lookup::Expired => Err(AppError::offline_expired()),
            Lookup::Missing => Err(why),
        }
    }

    // ---- the app's own copy of a list, kept up to date with changes only ------------------------------
    fn read_copy(&self, module: &str, who: &str) -> Result<Option<LocalCopy>, AppError> {
        match self.cache.get(&format!("sync:{module}"), who, self.clock.now())? {
            Lookup::Fresh(c) => Ok(serde_json::from_slice(&c.data).ok()),
            Lookup::Expired => Err(AppError::offline_expired()),
            Lookup::Missing => Ok(None),
        }
    }

    /// Asks the server for what changed since the last time (everything the first time) and updates the copy.
    /// With no connection the old copy stays; the answer says `offline: true`.
    pub async fn sync_list(&self, module: &str) -> Result<Value, AppError> {
        if module.is_empty() || !module.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
            return Err(AppError::new("bad_request", "Unknown list."));
        }
        let (who, offline_days) = {
            let guard = self.state.lock().await;
            let active = guard.as_ref().ok_or_else(|| AppError::new("session_expired", "Please sign in."))?;
            (owner(&active.company, &active.email), active.meta.offline_days)
        };
        let old = self.read_copy(module, &who).unwrap_or(None);
        let since = old.as_ref().map(|c| c.last_sync).unwrap_or(0);
        let path = format!("/api/v1/desktop/master-changes/{module}?since={since}");
        match self.online_get(&path, Duration::from_secs(120)).await {
            Ok(answer) => {
                let base = old.unwrap_or_default();
                let m = syncstore::merge(&base, &answer);
                let now = self.clock.now();
                if !self.no_offline.load(std::sync::atomic::Ordering::SeqCst) {
                    if let Ok(bytes) = serde_json::to_vec(&m.copy) {
                        let _ = self.cache.put(&format!("sync:{module}"), &who, now, now + offline_days * DAY, &bytes);
                    }
                }
                if let Some(active) = self.state.lock().await.as_mut() {
                    active.offline = false;
                }
                Ok(json!({"changed": m.changed, "removed": m.removed, "total": m.copy.rows.len(),
                          "full": answer.get("full").cloned().unwrap_or(Value::Bool(false)), "offline": false}))
            }
            Err(CallError::Transport(t)) => match old {
                Some(c) => {
                    if let Some(active) = self.state.lock().await.as_mut() {
                        active.offline = true;
                    }
                    Ok(json!({"changed": 0, "removed": 0, "total": c.rows.len(), "full": false, "offline": true}))
                }
                None => Err(map_transport_error(&t)),
            },
            Err(CallError::Api(e)) if e.code == "server_error" => match old {
                Some(c) => Ok(json!({"changed": 0, "removed": 0, "total": c.rows.len(), "full": false, "offline": false})),
                None => Err(e),
            },
            Err(CallError::Api(e)) => Err(self.session_ended(e).await),
        }
    }

    /// The list screen's page, read from the app's own copy (search, status, sort and paging done here).
    #[allow(clippy::too_many_arguments)]
    pub async fn local_list(&self, module: &str, search: &str, page: u32, size: u32, status: &str, sort: &str, desc: bool) -> Result<Fetched, AppError> {
        let who = {
            let guard = self.state.lock().await;
            let active = guard.as_ref().ok_or_else(|| AppError::new("session_expired", "Please sign in."))?;
            owner(&active.company, &active.email)
        };
        let copy = self.read_copy(module, &who)?.ok_or_else(|| AppError::new("no_copy", "This list has not been copied to this computer yet."))?;
        let data = syncstore::view(&copy, module, &View { search, status, sort, desc, page, size });
        Ok(Fetched { data, source: "local".to_string(), saved_at: copy.last_sync })
    }

    /// Tells the server a remote-control or recording program was seen ("detected") or was still running after the
    /// grace time ("switch_off", which also switches this computer off). Best effort.
    pub async fn report_security(&self, action: &str, names: Vec<String>, kinds: Vec<String>) -> Value {
        let call = {
            let guard = self.state.lock().await;
            guard.as_ref().and_then(|a| a.access.as_ref().map(|(token, _)| (a.base.clone(), token.clone())))
        };
        if let Some((base, token)) = call {
            let body = json!({ "action": action, "names": names, "kinds": kinds });
            if let Ok(v) = self.send(Method::Post, &base, "/api/v1/desktop/security-event", Some(token), Some(body), LOGOUT_TIMEOUT).await {
                return v;
            }
        }
        json!({})
    }

    // ---- sign out ------------------------------------------------------------------------------
    pub async fn sign_out(&self) -> Result<(), AppError> {
        let call = {
            let guard = self.state.lock().await;
            guard.as_ref().and_then(|a| a.access.as_ref().map(|(token, _)| (a.base.clone(), token.clone())))
        };
        if let Some((base, token)) = call {
            // best effort: the computer signs out even when the server cannot be reached
            let _ = self.send(Method::Post, &base, "/api/v1/desktop/logout", Some(token), Some(json!({})), LOGOUT_TIMEOUT).await;
        }
        self.wipe_all().await;
        Ok(())
    }
}

/// A dashboard month as the web month list writes it: "Oct-2026".
fn is_month(m: &str) -> bool {
    let b = m.as_bytes();
    b.len() == 8 && b[..3].iter().all(|c| c.is_ascii_alphabetic()) && b[3] == b'-' && b[4..].iter().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod month_tests {
    #[test]
    fn only_web_months_are_sent() {
        assert!(super::is_month("Oct-2026"));
        for bad in ["", "Oct-26", "10-2026", "Oct-2026&x=1", "Oct 2026", "Okt-202a"] {
            assert!(!super::is_month(bad), "{bad}");
        }
    }
}

fn check_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.len() > 60 || !name.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
        return Err(AppError::new("bad_request", "Unknown page."));
    }
    Ok(())
}
