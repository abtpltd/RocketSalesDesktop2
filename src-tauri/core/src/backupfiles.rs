//! Automatic backup files of the person's presentations: where they go and how many are kept. The file is made and locked
//! by the app's page code; this only checks the name, writes it into one folder and removes the oldest copies.
use crate::errors::AppError;
use std::fs;
use std::path::{Path, PathBuf};

pub const PREFIX: &str = "RocketSales-auto-";
pub const EXT: &str = ".rspres";
pub const MAX_BYTES: usize = 200 * 1024 * 1024;

/// A backup file name is ours only when it starts with the prefix, ends with the extension and holds plain characters.
pub fn valid_name(name: &str) -> bool {
    name.starts_with(PREFIX)
        && name.ends_with(EXT)
        && name.len() <= 120
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        && !name.contains("..")
}

/// A secret name for the backup password of one person: only letters, digits and `|@.-_`.
pub fn valid_secret_name(name: &str) -> bool {
    name.starts_with("presentation-backup|")
        && name.len() <= 200
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "|@.-_".contains(c))
}

/// Writes the file into `dir` (made if missing) and keeps only the newest `keep` of our backup files there.
pub fn save(dir: &Path, name: &str, bytes: &[u8], keep: usize) -> Result<PathBuf, AppError> {
    if !valid_name(name) {
        return Err(AppError::new("bad_request", "That is not a backup file name."));
    }
    if bytes.len() > MAX_BYTES {
        return Err(AppError::new("bad_request", "The backup is too large to save."));
    }
    fs::create_dir_all(dir).map_err(|e| AppError::new("save_failed", format!("Could not make the backup folder: {e}")))?;
    let path = dir.join(name);
    fs::write(&path, bytes).map_err(|e| AppError::new("save_failed", format!("Could not save the backup: {e}")))?;
    prune(dir, keep.clamp(1, 20));
    Ok(path)
}

/// Removes our oldest backup files beyond `keep` (by name, which holds the date, then by modified time). Never touches other files.
pub fn prune(dir: &Path, keep: usize) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut files: Vec<(String, std::time::SystemTime)> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            if !valid_name(&n) {
                return None;
            }
            let t = e.metadata().ok()?.modified().ok()?;
            Some((n, t))
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    for (n, _) in files.into_iter().skip(keep) {
        let _ = fs::remove_file(dir.join(n));
    }
}
