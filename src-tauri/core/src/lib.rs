//! RocketSales desktop core: everything that is not window code. Pure Rust so it is tested without Tauri.
pub mod allowlist;
pub mod backupfiles;
pub mod guard;
pub mod syncstore;
pub mod api;
pub mod cache;
pub mod clock;
pub mod config;
pub mod crypto;
pub mod devicekey;
pub mod errors;
pub mod map;
pub mod prefs;
pub mod secrets;
pub mod service;

pub use errors::AppError;
