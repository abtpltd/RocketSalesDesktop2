//! The offline copy: SQLite file on disk, every value encrypted with AES-256-GCM.
//! The key lives in the OS credential store, never next to the data.
//! A copy expires `offline_days` after it was saved; an expired copy is deleted when it is looked up.
use crate::crypto;
use crate::errors::AppError;
use crate::secrets::SecretStore;
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Arc, Mutex};

const KEY_NAME: &str = "offline-key";

#[derive(Debug, Clone, PartialEq)]
pub struct Cached {
    pub data: Vec<u8>,
    pub saved_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Lookup {
    Fresh(Cached),
    Expired,
    Missing,
}

pub struct OfflineCache {
    conn: Mutex<Connection>,
    secrets: Arc<dyn SecretStore>,
}

fn db_error(e: rusqlite::Error) -> AppError {
    AppError::new("offline_store", format!("The offline copy could not be used: {e}"))
}

impl OfflineCache {
    pub fn open(path: &Path, secrets: Arc<dyn SecretStore>) -> Result<Self, AppError> {
        let conn = Connection::open(path).map_err(db_error)?;
        Self::init(conn, secrets)
    }

    pub fn open_in_memory(secrets: Arc<dyn SecretStore>) -> Result<Self, AppError> {
        Self::init(Connection::open_in_memory().map_err(db_error)?, secrets)
    }

    fn init(conn: Connection, secrets: Arc<dyn SecretStore>) -> Result<Self, AppError> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS entries (
                kind TEXT NOT NULL,
                owner TEXT NOT NULL,
                saved_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                blob BLOB NOT NULL,
                PRIMARY KEY (kind, owner)
            );",
        )
        .map_err(db_error)?;
        Ok(OfflineCache { conn: Mutex::new(conn), secrets })
    }

    fn key(&self) -> Result<[u8; 32], AppError> {
        if let Some(text) = self.secrets.get(KEY_NAME)? {
            if let Ok(bytes) = STANDARD.decode(text) {
                if let Ok(key) = <[u8; 32]>::try_from(bytes.as_slice()) {
                    return Ok(key);
                }
            }
        }
        let key = crypto::new_key();
        self.secrets.set(KEY_NAME, &STANDARD.encode(key))?;
        Ok(key)
    }

    fn aad(kind: &str, owner: &str, saved_at: i64, expires_at: i64) -> Vec<u8> {
        format!("{kind}|{owner}|{saved_at}|{expires_at}").into_bytes()
    }

    /// `owner` is "company|email": a copy is only ever readable by the user it was saved for.
    pub fn put(&self, kind: &str, owner: &str, saved_at: i64, expires_at: i64, data: &[u8]) -> Result<(), AppError> {
        let key = self.key()?;
        let blob = crypto::seal(&key, &Self::aad(kind, owner, saved_at, expires_at), data)
            .map_err(AppError::internal)?;
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO entries (kind, owner, saved_at, expires_at, blob) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![kind, owner, saved_at, expires_at, blob],
            )
            .map_err(db_error)?;
        Ok(())
    }

    pub fn get(&self, kind: &str, owner: &str, now: i64) -> Result<Lookup, AppError> {
        let row = {
            let conn = self.conn.lock().unwrap();
            conn.query_row(
                "SELECT saved_at, expires_at, blob FROM entries WHERE kind = ?1 AND owner = ?2",
                params![kind, owner],
                |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, Vec<u8>>(2)?)),
            )
            .optional()
            .map_err(db_error)?
        };
        let Some((saved_at, expires_at, blob)) = row else {
            return Ok(Lookup::Missing);
        };
        if now >= expires_at {
            self.delete(kind, owner)?;
            return Ok(Lookup::Expired);
        }
        let key = self.key()?;
        match crypto::open(&key, &Self::aad(kind, owner, saved_at, expires_at), &blob) {
            Ok(data) => Ok(Lookup::Fresh(Cached { data, saved_at, expires_at })),
            Err(_) => {
                // edited file, moved row or lost key: the copy is unusable, so drop it
                self.delete(kind, owner)?;
                Ok(Lookup::Missing)
            }
        }
    }

    /// Every unexpired copy of this user whose kind starts with `prefix`, newest first. Nothing is deleted here.
    pub fn list_prefix(&self, prefix: &str, owner: &str, now: i64) -> Result<Vec<(String, Cached)>, AppError> {
        let rows: Vec<(String, i64, i64, Vec<u8>)> = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn
                .prepare(
                    "SELECT kind, saved_at, expires_at, blob FROM entries
                     WHERE owner = ?1 AND substr(kind, 1, ?2) = ?3 AND expires_at > ?4 ORDER BY saved_at DESC",
                )
                .map_err(db_error)?;
            let found = stmt
                .query_map(params![owner, prefix.chars().count() as i64, prefix, now], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, Vec<u8>>(3)?))
                })
                .map_err(db_error)?
                .filter_map(Result::ok)
                .collect();
            found
        };
        let key = self.key()?;
        Ok(rows
            .into_iter()
            .filter_map(|(kind, saved_at, expires_at, blob)| {
                crypto::open(&key, &Self::aad(&kind, owner, saved_at, expires_at), &blob)
                    .ok()
                    .map(|data| (kind, Cached { data, saved_at, expires_at }))
            })
            .collect())
    }

    pub fn delete(&self, kind: &str, owner: &str) -> Result<(), AppError> {
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM entries WHERE kind = ?1 AND owner = ?2", params![kind, owner])
            .map_err(db_error)?;
        Ok(())
    }

    /// The role may not keep offline copies: drop this user's saved copies except the kinds listed (session, menu).
    pub fn clear_owner_except(&self, owner: &str, keep: &[&str]) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT kind FROM entries WHERE owner = ?1").map_err(db_error)?;
        let kinds: Vec<String> = stmt
            .query_map(params![owner], |r| r.get::<_, String>(0))
            .map_err(db_error)?
            .filter_map(Result::ok)
            .filter(|k| !keep.contains(&k.as_str()))
            .collect();
        for k in kinds {
            conn.execute("DELETE FROM entries WHERE kind = ?1 AND owner = ?2", params![k, owner]).map_err(db_error)?;
        }
        Ok(())
    }

    /// Sign-out or revoked computer: erase every row, compact the file, and throw the key away.
    pub fn wipe(&self) -> Result<(), AppError> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute("DELETE FROM entries", []).map_err(db_error)?;
            conn.execute_batch("VACUUM;").map_err(db_error)?;
        }
        self.secrets.delete(KEY_NAME)
    }

    pub fn row_count(&self) -> Result<i64, AppError> {
        self.conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM entries", [], |r| r.get(0))
            .map_err(db_error)
    }
}

impl OfflineCache {
    /// Test helper: run raw SQL against the file, as someone editing it by hand would.
    #[doc(hidden)]
    pub fn exec_for_test(&self, sql: &str) {
        self.conn.lock().unwrap().execute_batch(sql).unwrap();
    }
}
