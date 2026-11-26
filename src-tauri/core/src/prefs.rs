//! Screen preferences kept in a file next to the offline copy (`ui-prefs.json` in the app data folder), so they
//! survive a new installer, an update and a cleared browser cache: colour theme, text size, saved dashboard views,
//! grid columns and filters, recent pages. The screen keeps them in its own storage too; this file is the copy it
//! restores from when that storage comes back empty.
//!
//! Only plain screen settings: no passwords or tokens (those stay in the Windows credential store). Values are text;
//! very large values and too many keys are left out rather than refused, so saving never fails the screen.
use crate::errors::AppError;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub const MAX_KEYS: usize = 500;
pub const MAX_VALUE: usize = 256 * 1024;
pub const MAX_TOTAL: usize = 4 * 1024 * 1024;

pub type Prefs = BTreeMap<String, String>;

/// Keeps what may be stored: keys of sensible length, values under the size cap, the total under its cap.
pub fn clean(input: Prefs) -> Prefs {
    let mut out = Prefs::new();
    let mut total = 0usize;
    for (k, v) in input {
        if k.is_empty() || k.len() > 200 || v.len() > MAX_VALUE || out.len() >= MAX_KEYS {
            continue;
        }
        if total + k.len() + v.len() > MAX_TOTAL {
            continue;
        }
        total += k.len() + v.len();
        out.insert(k, v);
    }
    out
}

/// The saved preferences; a missing or damaged file gives none (the screen then starts with its defaults).
pub fn load(path: &Path) -> Prefs {
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str::<Prefs>(&text).map(clean).unwrap_or_default(),
        Err(_) => Prefs::new(),
    }
}

/// Writes all preferences at once: to a temporary file first, then renamed over the old one, so a crash mid-write
/// never leaves a half-written file.
pub fn save(path: &Path, prefs: Prefs) -> Result<(), AppError> {
    let prefs = clean(prefs);
    let text = serde_json::to_string(&prefs).map_err(|e| AppError::internal(e.to_string()))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| AppError::new("prefs", format!("Settings could not be saved: {e}")))?;
    fs::rename(&tmp, path).map_err(|e| AppError::new("prefs", format!("Settings could not be saved: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_and_loads_and_survives_a_damaged_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui-prefs.json");
        assert!(load(&path).is_empty());
        let mut p = Prefs::new();
        p.insert("ui-theme".into(), "sunset".into());
        p.insert("dash-view|acme|a@b.c|home".into(), "{\"order\":[\"CDV\"]}".into());
        save(&path, p.clone()).unwrap();
        assert_eq!(load(&path), p);
        assert!(!dir.path().join("ui-prefs.json.tmp").exists());
        fs::write(&path, "{not json").unwrap();
        assert!(load(&path).is_empty());
    }

    #[test]
    fn oversized_values_and_bad_keys_are_left_out() {
        let mut p = Prefs::new();
        p.insert("big".into(), "x".repeat(MAX_VALUE + 1));
        p.insert(String::new(), "v".into());
        p.insert("k".repeat(201), "v".into());
        p.insert("ok".into(), "v".into());
        assert_eq!(clean(p).keys().cloned().collect::<Vec<_>>(), vec!["ok".to_string()]);
    }
}
