//! Tauri shell: wires the core crate to the window. All rules live in `rocketsales-core`.
use rocketsales_core::allowlist::{classic_url, is_allowed};
use rocketsales_core::api::ReqwestTransport;
use rocketsales_core::cache::OfflineCache;
use rocketsales_core::clock::{Clock, SystemClock};
use rocketsales_core::config::Config;
use rocketsales_core::map::{self, Answer, MapCache, MapSettings, MapStatus, MapStore, ReqwestMapFetch};
use rocketsales_core::secrets::KeyringStore;
use rocketsales_core::service::{DeviceInfo, Desktop, Fetched, GridOpts, Kind, SessionInfo};
use rocketsales_core::AppError;
use serde::Serialize;
use std::fs;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use url::Url;

type Svc = Desktop<ReqwestTransport>;
type Maps = MapCache<ReqwestMapFetch>;

const CLASSIC: &str = "classic";
const KEYRING_SERVICE: &str = "RocketSales Desktop";

#[derive(Serialize)]
struct AppInfo {
    version: String,
    device_name: String,
    device_id: String,
}

fn close_classic(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(CLASSIC) {
        let _ = window.close();
    }
}

/// The classic window must not outlive a sign-in.
fn close_if_session_over(app: &AppHandle, error: &AppError) {
    if error.code == "device_revoked" || error.code == "session_expired" {
        close_classic(app);
    }
}

#[tauri::command]
async fn session_restore(app: AppHandle, svc: State<'_, Svc>) -> Result<Option<SessionInfo>, AppError> {
    let result = svc.restore().await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

/// Saves an export (Excel file) in the user's Downloads folder and returns where it went. The name is cleaned and
/// never overwrites: "Visits.xlsx", "Visits (1).xlsx", ...
#[tauri::command]
async fn save_download(app: AppHandle, name: String, data_base64: String) -> Result<String, AppError> {
    use base64::Engine;
    use tauri::Manager;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|_| AppError::new("bad_request", "The file could not be read."))?;
    if bytes.len() > 60 * 1024 * 1024 {
        return Err(AppError::new("bad_request", "The file is too large to save."));
    }
    let dir = app.path().download_dir().map_err(|e| AppError::internal(e.to_string()))?;
    let clean: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || " -_().".contains(c) { c } else { '_' })
        .collect::<String>()
        .trim()
        .chars()
        .take(120)
        .collect();
    let clean = if clean.is_empty() || clean.starts_with('.') { "export.xlsx".to_string() } else { clean };
    let (stem, ext) = match clean.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), format!(".{e}")),
        None => (clean.clone(), String::new()),
    };
    let mut path = dir.join(&clean);
    let mut n = 1;
    while path.exists() && n < 1000 {
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    fs::write(&path, bytes).map_err(|e| AppError::new("save_failed", format!("Could not save the file: {e}")))?;
    Ok(path.to_string_lossy().to_string())
}

/// Automatic backup of the person's presentations: a locked file in Documents\RocketSales\Presentations (outside the app's own
/// storage, so a reinstall does not touch it). Only our own backup names; the oldest beyond `keep` are removed.
#[tauri::command]
async fn save_backup(app: AppHandle, name: String, data_base64: String, keep: u32) -> Result<String, AppError> {
    use base64::Engine;
    use tauri::Manager;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|_| AppError::new("bad_request", "The backup could not be read."))?;
    let docs = app.path().document_dir().map_err(|e| AppError::internal(e.to_string()))?;
    let dir = docs.join("RocketSales").join("Presentations");
    let path = rocketsales_core::backupfiles::save(&dir, &name, &bytes, keep as usize)?;
    Ok(path.to_string_lossy().to_string())
}

/// Looks for remote-control and screen-recording programs (and a Remote Desktop session). Windows only; elsewhere nothing is found.
/// True while this person may screen-share the app (the provider allowed their role or a sharing session).
struct ShareOk(std::sync::atomic::AtomicBool);

/// Hides the app's windows from screenshots, recorders and meeting screen-sharing (`on`), or lets them show.
#[tauri::command]
fn set_protected(app: AppHandle, on: bool) {
    use std::sync::atomic::Ordering;
    app.state::<ShareOk>().0.store(!on, Ordering::SeqCst);
    for (_, w) in app.webview_windows() {
        let _ = w.set_content_protected(on);
    }
}

#[tauri::command]
async fn guard_scan() -> rocketsales_core::guard::Scan {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let out = std::process::Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .creation_flags(0x0800_0000) // no console window
            .output();
        let names = match out {
            Ok(o) => rocketsales_core::guard::parse_tasklist_interactive(&String::from_utf8_lossy(&o.stdout)),
            Err(_) => Vec::new(),
        };
        let session = std::env::var("SESSIONNAME").unwrap_or_default();
        rocketsales_core::guard::classify(&names, &session)
    }
    #[cfg(not(windows))]
    {
        rocketsales_core::guard::Scan::default()
    }
}

/// The backup password is kept in the operating system's credential store, one per person and company.
struct BackupSecrets(Arc<dyn rocketsales_core::secrets::SecretStore>);

#[tauri::command]
async fn backup_secret_get(state: tauri::State<'_, BackupSecrets>, name: String) -> Result<Option<String>, AppError> {
    if !rocketsales_core::backupfiles::valid_secret_name(&name) {
        return Err(AppError::new("bad_request", "Unknown secret."));
    }
    state.0.get(&name)
}

#[tauri::command]
async fn backup_secret_set(state: tauri::State<'_, BackupSecrets>, name: String, value: Option<String>) -> Result<(), AppError> {
    if !rocketsales_core::backupfiles::valid_secret_name(&name) {
        return Err(AppError::new("bad_request", "Unknown secret."));
    }
    match value {
        Some(v) if !v.is_empty() && v.len() <= 200 => state.0.set(&name, &v),
        _ => state.0.delete(&name),
    }
}

/// Opens the Downloads folder with the saved file selected (Windows Explorer). Only files in Downloads.
#[tauri::command]
async fn show_download(app: AppHandle, path: String) -> Result<(), AppError> {
    use tauri::Manager;
    let dir = app.path().download_dir().map_err(|e| AppError::internal(e.to_string()))?;
    let p = std::path::PathBuf::from(&path);
    if p.parent() != Some(dir.as_path()) || !p.exists() {
        return Err(AppError::new("bad_request", "That file is not in your Downloads folder."));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", p.display()))
            .spawn()
            .map_err(|e| AppError::internal(e.to_string()))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = p;
    }
    Ok(())
}

/// Only phone calls, email, WhatsApp chats and map links, built from digits or encoded text: nothing else is opened.
fn contact_link_ok(url: &str) -> bool {
    let safe = |rest: &str, extra: &str| !rest.is_empty() && rest.len() < 2000
        && rest.chars().all(|c| c.is_ascii_alphanumeric() || "%.-_+@,=&?/".contains(c) || extra.contains(c));
    if let Some(rest) = url.strip_prefix("tel:") {
        return rest.len() < 30 && rest.chars().all(|c| c.is_ascii_digit() || c == '+');
    }
    if let Some(rest) = url.strip_prefix("mailto:") {
        return safe(rest, "");
    }
    if let Some(rest) = url.strip_prefix("https://wa.me/") {
        return safe(rest, "");
    }
    if let Some(rest) = url.strip_prefix("https://www.google.com/maps/search/?api=1&query=") {
        return safe(rest, "");
    }
    false
}

#[tauri::command]
async fn open_contact(url: String) -> Result<(), AppError> {
    if !contact_link_ok(&url) {
        return Err(AppError::new("bad_request", "This link cannot be opened."));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(&url).spawn().map_err(|e| AppError::internal(e.to_string()))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&url).spawn().map_err(|e| AppError::internal(e.to_string()))?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| AppError::internal(e.to_string()))?;
    }
    Ok(())
}

#[cfg(test)]
mod contact_tests {
    #[test]
    fn only_contact_links_open() {
        assert!(super::contact_link_ok("tel:+254700111222"));
        assert!(super::contact_link_ok("https://wa.me/254700111222?text=Hello%20there"));
        assert!(super::contact_link_ok("mailto:a@b.com?subject=Hi%20there"));
        assert!(super::contact_link_ok("https://www.google.com/maps/search/?api=1&query=-1.28,36.81"));
        assert!(!super::contact_link_ok("tel:1;calc"));
        assert!(!super::contact_link_ok("https://evil.com"));
        assert!(!super::contact_link_ok("https://wa.me/1\" calc"));
        assert!(!super::contact_link_ok("file:///c:/windows"));
    }
}

fn grid_opts(sort: Option<String>, desc: Option<bool>, manager: Option<String>, app_user: Option<String>, export: Option<bool>) -> GridOpts {
    GridOpts {
        sort: sort.unwrap_or_default(),
        desc: desc.unwrap_or(false),
        manager: manager.unwrap_or_default(),
        app_user: app_user.unwrap_or_default(),
        export: export.unwrap_or(false),
    }
}

#[tauri::command]
async fn fetch_thought(svc: State<'_, Svc>, company: Option<String>) -> Result<serde_json::Value, AppError> {
    svc.thought(company.as_deref()).await
}

#[tauri::command]
async fn fetch_pipeline(svc: State<'_, Svc>, q: Option<String>) -> Result<serde_json::Value, AppError> {
    svc.fetch_pipeline(q.as_deref()).await
}

#[tauri::command]
async fn pipeline_act(svc: State<'_, Svc>, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    svc.pipeline_act(body).await
}

#[tauri::command]
async fn fetch_notifications(svc: State<'_, Svc>) -> Result<serde_json::Value, AppError> {
    svc.fetch_notifications().await
}

#[tauri::command]
async fn fetch_profile(svc: State<'_, Svc>, kind: String, key: String) -> Result<serde_json::Value, AppError> {
    svc.fetch_profile(&kind, &key).await
}

#[tauri::command]
async fn touch_base(svc: State<'_, Svc>, kind: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    svc.touch_base(&kind, body).await
}

#[tauri::command]
async fn fetch_brand(svc: State<'_, Svc>, company: Option<String>) -> Result<serde_json::Value, AppError> {
    svc.brand(company.as_deref()).await
}

#[tauri::command]
async fn saved_reports(svc: State<'_, Svc>, name: String) -> Result<Vec<Fetched>, AppError> {
    svc.saved_reports(&name).await
}

#[tauri::command]
async fn fetch_assistant(svc: State<'_, Svc>) -> Result<serde_json::Value, AppError> {
    svc.assistant().await
}

#[tauri::command]
async fn save_assistant(svc: State<'_, Svc>, settings: serde_json::Value) -> Result<serde_json::Value, AppError> {
    svc.save_assistant(settings).await
}

#[tauri::command]
async fn fetch_joint(svc: State<'_, Svc>) -> Result<serde_json::Value, AppError> {
    svc.joint().await
}

#[tauri::command]
async fn save_joint(svc: State<'_, Svc>, settings: serde_json::Value) -> Result<serde_json::Value, AppError> {
    svc.save_joint(settings).await
}

#[tauri::command]
async fn save_brand(svc: State<'_, Svc>, logo: String) -> Result<serde_json::Value, AppError> {
    svc.save_brand(&logo).await
}

#[tauri::command]
async fn login(svc: State<'_, Svc>, company: String, email: String, password: String) -> Result<SessionInfo, AppError> {
    svc.login(&company, &email, &password).await
}

#[tauri::command]
async fn fetch_dashboard(app: AppHandle, svc: State<'_, Svc>, month: Option<String>) -> Result<Fetched, AppError> {
    let result = svc.fetch(Kind::Dashboard, month.as_deref()).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_menu(app: AppHandle, svc: State<'_, Svc>) -> Result<Fetched, AppError> {
    let result = svc.fetch(Kind::Menu, None).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_master_list(
    app: AppHandle,
    svc: State<'_, Svc>,
    module: String,
    search: Option<String>,
    page: Option<u32>,
    size: Option<u32>,
    status: Option<String>,
    sort: Option<String>,
    desc: Option<bool>,
    manager: Option<String>,
    app_user: Option<String>,
    export: Option<bool>,
) -> Result<Fetched, AppError> {
    let grid = grid_opts(sort, desc, manager, app_user, export);
    let result = svc
        .fetch_list_with(&module, search.as_deref().unwrap_or(""), page.unwrap_or(1), size.unwrap_or(100), status.as_deref().unwrap_or(""), &grid)
        .await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn sync_list(app: AppHandle, svc: State<'_, Svc>, module: String) -> Result<serde_json::Value, AppError> {
    let result = svc.sync_list(&module).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn local_list(
    svc: State<'_, Svc>,
    module: String,
    search: Option<String>,
    page: Option<u32>,
    size: Option<u32>,
    status: Option<String>,
    sort: Option<String>,
    desc: Option<bool>,
) -> Result<Fetched, AppError> {
    svc.local_list(&module, search.as_deref().unwrap_or(""), page.unwrap_or(1), size.unwrap_or(100), status.as_deref().unwrap_or(""), sort.as_deref().unwrap_or(""), desc.unwrap_or(false)).await
}

#[tauri::command]
async fn fetch_mapping(app: AppHandle, svc: State<'_, Svc>, rep: Option<String>, kind: Option<String>) -> Result<Fetched, AppError> {
    let result = svc.fetch_mapping(rep.as_deref().unwrap_or(""), kind.as_deref().unwrap_or("customer")).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_orders(
    app: AppHandle,
    svc: State<'_, Svc>,
    from: Option<String>,
    to: Option<String>,
    status: Option<String>,
    search: Option<String>,
    page: Option<u32>,
    size: Option<u32>,
    sort: Option<String>,
    desc: Option<bool>,
    manager: Option<String>,
    app_user: Option<String>,
    export: Option<bool>,
) -> Result<Fetched, AppError> {
    let grid = grid_opts(sort, desc, manager, app_user, export);
    let result = svc
        .fetch_orders_with(
            from.as_deref().unwrap_or(""),
            to.as_deref().unwrap_or(""),
            status.as_deref().unwrap_or(""),
            search.as_deref().unwrap_or(""),
            page.unwrap_or(1),
            size.unwrap_or(100),
            &grid,
        )
        .await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_order(app: AppHandle, svc: State<'_, Svc>, key: String, kind: Option<String>) -> Result<Fetched, AppError> {
    let result = svc.fetch_order_of(&key, kind.as_deref().unwrap_or("")).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_report(
    app: AppHandle,
    svc: State<'_, Svc>,
    name: String,
    from: Option<String>,
    to: Option<String>,
    search: Option<String>,
    rep: Option<String>,
    kind: Option<String>,
    page: Option<u32>,
    size: Option<u32>,
    sort: Option<String>,
    desc: Option<bool>,
    manager: Option<String>,
    app_user: Option<String>,
    export: Option<bool>,
) -> Result<Fetched, AppError> {
    let grid = grid_opts(sort, desc, manager, app_user, export);
    let result = svc
        .fetch_report_with(
            &name,
            from.as_deref().unwrap_or(""),
            to.as_deref().unwrap_or(""),
            search.as_deref().unwrap_or(""),
            rep.as_deref().unwrap_or(""),
            kind.as_deref().unwrap_or(""),
            page.unwrap_or(1),
            size.unwrap_or(100),
            &grid,
        )
        .await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_form(app: AppHandle, svc: State<'_, Svc>, name: String, key: Option<String>) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_form(&name, key.as_deref().unwrap_or("")).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn submit_form(app: AppHandle, svc: State<'_, Svc>, name: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.submit_form(&name, body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn run_action(app: AppHandle, svc: State<'_, Svc>, name: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.run_action(&name, body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_order_edit(app: AppHandle, svc: State<'_, Svc>, kind: String, key: Option<String>, base_price: Option<String>) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_order_edit(&kind, key.as_deref().unwrap_or(""), base_price.as_deref().unwrap_or("")).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn save_order_edit(app: AppHandle, svc: State<'_, Svc>, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.save_order_edit(body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_designer(app: AppHandle, svc: State<'_, Svc>, name: String, key: Option<String>) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_designer(&name, key.as_deref().unwrap_or("")).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn save_designer(app: AppHandle, svc: State<'_, Svc>, name: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.save_designer(&name, body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_setup(app: AppHandle, svc: State<'_, Svc>, name: String) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_setup(&name).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn save_setup(app: AppHandle, svc: State<'_, Svc>, name: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.save_setup(&name, body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_grid(app: AppHandle, svc: State<'_, Svc>, name: String, params: std::collections::BTreeMap<String, String>) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_grid(&name, params).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn save_grid(app: AppHandle, svc: State<'_, Svc>, name: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.save_grid(&name, body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_stock_request(app: AppHandle, svc: State<'_, Svc>, key: String) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_stock_request(&key).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn approve_stock_request(app: AppHandle, svc: State<'_, Svc>, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.approve_stock_request(body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_tool(app: AppHandle, svc: State<'_, Svc>, name: String) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_tool(&name).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn save_tool(app: AppHandle, svc: State<'_, Svc>, name: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.save_tool(&name, body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn fetch_stock_doc(app: AppHandle, svc: State<'_, Svc>, kind: String) -> Result<serde_json::Value, AppError> {
    let result = svc.fetch_stock_doc(&kind).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn save_stock_doc(app: AppHandle, svc: State<'_, Svc>, kind: String, body: serde_json::Value) -> Result<serde_json::Value, AppError> {
    let result = svc.save_stock_doc(&kind, body).await;
    if let Err(e) = &result {
        close_if_session_over(&app, e);
    }
    result
}

#[tauri::command]
async fn guard_report(svc: State<'_, Svc>, action: String, names: Vec<String>, kinds: Vec<String>) -> Result<serde_json::Value, AppError> {
    Ok(svc.report_security(&action, names, kinds).await)
}

#[tauri::command]
async fn sign_out(app: AppHandle, svc: State<'_, Svc>) -> Result<(), AppError> {
    let result = svc.sign_out().await;
    close_classic(&app);
    result
}

#[tauri::command]
async fn app_info(app: AppHandle, svc: State<'_, Svc>) -> Result<AppInfo, AppError> {
    let device = svc.device();
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        device_name: device.name.clone(),
        device_id: device.id.clone(),
    })
}

/// Opens a not-yet-migrated page of the existing web site in the second ("classic") window.
/// Must be async: creating a window from a sync command can deadlock on Windows.
#[tauri::command]
async fn open_classic(app: AppHandle, svc: State<'_, Svc>, path: String) -> Result<(), AppError> {
    let info = svc.session_info().await.ok_or_else(|| AppError::new("session_expired", "Please sign in."))?;
    let base = Url::parse(&info.base_url).map_err(|e| AppError::internal(e.to_string()))?;
    let target = classic_url(&base, &path)?;
    if let Some(window) = app.get_webview_window(CLASSIC) {
        window.navigate(target).map_err(|e| AppError::internal(e.to_string()))?;
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let guard = base.clone();
    WebviewWindowBuilder::new(&app, CLASSIC, WebviewUrl::External(target))
        .title(format!("{} - classic view", info.company.title))
        .content_protected(!app.state::<ShareOk>().0.load(std::sync::atomic::Ordering::SeqCst))
        .inner_size(1280.0, 860.0)
        .on_navigation(move |url| is_allowed(url, &guard))
        .build()
        .map_err(|e| AppError::internal(e.to_string()))?;
    Ok(())
}

fn device_info(dir: &std::path::Path, version: &str) -> DeviceInfo {
    let file = dir.join("device.id");
    let id = fs::read_to_string(&file)
        .map(|s| s.trim().to_string())
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let fresh = uuid::Uuid::new_v4().to_string();
            let _ = fs::write(&file, &fresh);
            fresh
        });
    let name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "This computer".to_string());
    DeviceInfo { id, name, app_version: version.to_string() }
}

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

/// Asks the update site whether a newer signed version exists. No update site, no network or no newer version: None.
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, AppError> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(u) => u,
        Err(_) => return Ok(None),
    };
    match updater.check().await {
        Ok(Some(u)) => Ok(Some(UpdateInfo { version: u.version.clone(), notes: u.body.clone() })),
        _ => Ok(None),
    }
}

/// Downloads the newer version, checks its signature against the key built into the app, installs it and restarts.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), AppError> {
    use tauri_plugin_updater::UpdaterExt;
    let fail = |_| AppError::new("update_failed", "The update could not be installed. Try again later.");
    let update = app.updater().map_err(fail)?.check().await.map_err(fail)?
        .ok_or_else(|| AppError::new("update_failed", "No newer version is available."))?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(fail)?;
    app.restart();
}

// ---- map pictures kept on this computer (see core map.rs) -------------------------------------------------------

async fn map_settings(svc: &Svc) -> MapSettings {
    svc.session_info().await.map(|s| s.map).unwrap_or_default()
}

/// Where the map screen should take its pictures from now, and how much is kept on disk. Also notes the source
/// for the next refresh, so the provider sees it without an extra request.
#[tauri::command]
async fn map_status(svc: State<'_, Svc>, maps: State<'_, Maps>) -> Result<MapStatus, AppError> {
    let now = SystemClock.now();
    let status = maps.status(&map_settings(&svc).await, now);
    svc.set_map_state(map::state_word(&status, now));
    Ok(status)
}

/// One byte range of the company's Protomaps file, from disk or downloaded once (binary answer, no JSON).
#[tauri::command]
async fn map_range(svc: State<'_, Svc>, maps: State<'_, Maps>, url: String, offset: u64, length: u64) -> Result<tauri::ipc::Response, AppError> {
    let settings = map_settings(&svc).await;
    match maps.pmtiles_range(&settings, &url, offset, length, SystemClock.now()).await? {
        Answer::Data(bytes) => Ok(tauri::ipc::Response::new(bytes)),
        Answer::Missing(status) => Err(AppError::new("map_unavailable", format!("This part of the map is not on this computer yet ({status})."))),
    }
}

/// Where the screen settings file lives (see core prefs.rs); writes are one at a time.
struct PrefsFile(std::path::PathBuf, std::sync::Mutex<()>);

#[tauri::command]
fn prefs_load(file: State<'_, PrefsFile>) -> rocketsales_core::prefs::Prefs {
    rocketsales_core::prefs::load(&file.0)
}

#[tauri::command]
fn prefs_save(file: State<'_, PrefsFile>, prefs: rocketsales_core::prefs::Prefs) -> Result<(), AppError> {
    let _one = file.1.lock().map_err(|_| AppError::internal("settings busy"))?;
    rocketsales_core::prefs::save(&file.0, prefs)
}

fn empty_response(status: u16) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder().status(status).body(Vec::new()).unwrap_or_default()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            let version = app.package_info().version.to_string();
            let config = fs::read_to_string(dir.join("config.json")).map(|t| Config::from_json(&t)).unwrap_or_default();
            let secrets: Arc<dyn rocketsales_core::secrets::SecretStore> = Arc::new(KeyringStore::new(KEYRING_SERVICE));
            app.manage(ShareOk(std::sync::atomic::AtomicBool::new(false)));
            app.manage(BackupSecrets(secrets.clone()));
            let cache = OfflineCache::open(&dir.join("offline.db"), secrets.clone())?;
            let transport = ReqwestTransport::new(&format!("RocketSalesDesktop/{version}"))?;
            let service: Svc = Desktop::new(transport, Arc::new(SystemClock), secrets, cache, config, device_info(&dir, &version));
            app.manage(service);
            let maps: Maps = MapCache::new(
                MapStore::open(&dir.join("map-cache.db"), map::DEFAULT_MAX_BYTES)?,
                ReqwestMapFetch::new(&format!("RocketSalesDesktop/{version} (RocketSales Windows desktop app)"))?,
            );
            app.manage(maps);
            app.manage(PrefsFile(dir.join("ui-prefs.json"), std::sync::Mutex::new(())));
            Ok(())
        })
        // rsmap://localhost/osm/{z}/{x}/{y}.png (http://rsmap.localhost/... on Windows): OpenStreetMap pictures through
        // the cache on this computer. Only the app's own window may use it, not the classic window.
        .register_asynchronous_uri_scheme_protocol("rsmap", |ctx, request, responder| {
            if ctx.webview_label() != "main" {
                responder.respond(empty_response(403));
                return;
            }
            let Some((z, x, y)) = map::parse_tile_path(request.uri().path()) else {
                responder.respond(empty_response(404));
                return;
            };
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let maps = app.state::<Maps>();
                let response = match maps.osm_tile(z, x, y, SystemClock.now()).await {
                    Answer::Data(bytes) => tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", "image/png")
                        .header("Cache-Control", "private, max-age=86400")
                        .body(bytes)
                        .unwrap_or_else(|_| empty_response(500)),
                    Answer::Missing(status) => empty_response(status),
                };
                responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![
            map_status,
            map_range,
            prefs_load,
            prefs_save,
            fetch_pipeline,
            pipeline_act,
            check_update,
            install_update,
            fetch_thought,
            fetch_brand,
            fetch_profile,
            fetch_notifications,
            open_contact,
            touch_base,
            save_brand,
            saved_reports,
            fetch_assistant,
            save_assistant,
            fetch_joint,
            save_joint,
            save_download,
            save_backup,
            guard_scan,
            set_protected,
            guard_report,
            backup_secret_get,
            backup_secret_set,
            show_download,
            session_restore,
            login,
            fetch_dashboard,
            fetch_menu,
            fetch_master_list,
            sync_list,
            local_list,
            fetch_mapping,
            fetch_orders,
            fetch_order,
            fetch_report,
            fetch_form,
            submit_form,
            run_action,
            fetch_order_edit,
            save_order_edit,
            fetch_designer,
            save_designer,
            fetch_setup,
            save_setup,
            fetch_grid,
            save_grid,
            fetch_stock_request,
            approve_stock_request,
            fetch_tool,
            save_tool,
            fetch_stock_doc,
            save_stock_doc,
            sign_out,
            app_info,
            open_classic
        ])
        .run(tauri::generate_context!())
        .expect("error while running the RocketSales desktop app");
}
