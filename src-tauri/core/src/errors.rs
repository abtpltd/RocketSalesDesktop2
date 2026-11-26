//! The one error type the whole app speaks. `code` is stable (the UI maps it to a plain message);
//! `message` is already plain English and is shown as-is when the UI has nothing better.
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_seconds: Option<u64>,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        AppError { code: code.to_string(), message: message.into(), retry_after_seconds: None }
    }

    pub fn with_retry(mut self, seconds: u64) -> Self {
        self.retry_after_seconds = Some(seconds);
        self
    }

    pub fn offline() -> Self {
        AppError::new("offline", "There is no internet connection, and nothing is saved on this computer yet.")
    }

    pub fn offline_expired() -> Self {
        AppError::new(
            "offline_expired",
            "The copy saved on this computer has expired. Connect to the internet and sign in again.",
        )
    }

    pub fn revoked() -> Self {
        AppError::new("device_revoked", "This computer has been switched off by your administrator.")
    }

    pub fn internal(message: impl Into<String>) -> Self {
        AppError::new("internal", message)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}
