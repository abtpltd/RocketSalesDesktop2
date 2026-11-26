//! Small secrets (the refresh token, the key that encrypts the offline copy) live in the operating
//! system's credential store: Windows Credential Manager on the target platform.
use crate::errors::AppError;
use std::collections::HashMap;
use std::sync::Mutex;

pub trait SecretStore: Send + Sync {
    fn get(&self, name: &str) -> Result<Option<String>, AppError>;
    fn set(&self, name: &str, value: &str) -> Result<(), AppError>;
    fn delete(&self, name: &str) -> Result<(), AppError>;
}

pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: &str) -> Self {
        KeyringStore { service: service.to_string() }
    }

    fn entry(&self, name: &str) -> Result<keyring::Entry, AppError> {
        keyring::Entry::new(&self.service, name).map_err(|e| AppError::new("secure_storage", e.to_string()))
    }
}

impl SecretStore for KeyringStore {
    fn get(&self, name: &str) -> Result<Option<String>, AppError> {
        match self.entry(name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::new("secure_storage", e.to_string())),
        }
    }

    fn set(&self, name: &str, value: &str) -> Result<(), AppError> {
        self.entry(name)?.set_password(value).map_err(|e| AppError::new("secure_storage", e.to_string()))
    }

    fn delete(&self, name: &str) -> Result<(), AppError> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::new("secure_storage", e.to_string())),
        }
    }
}

/// For tests, and the fallback when no credential store exists.
#[derive(Default)]
pub struct MemoryStore {
    values: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemoryStore {
    fn get(&self, name: &str) -> Result<Option<String>, AppError> {
        Ok(self.values.lock().unwrap().get(name).cloned())
    }

    fn set(&self, name: &str, value: &str) -> Result<(), AppError> {
        self.values.lock().unwrap().insert(name.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, name: &str) -> Result<(), AppError> {
        self.values.lock().unwrap().remove(name);
        Ok(())
    }
}
