//! Ties this app to this computer. The first time it runs it makes an Ed25519 key pair and keeps the private half in the
//! operating system's credential store (Windows Credential Manager, macOS Keychain). The server remembers the public
//! half. Every sign-in and refresh carries the time and a signature over it, so copying the plain device id file to
//! another computer is not enough to use the account there. The private key never leaves the computer.
//!
//! The messages must match the server (src/desktop_api/devicekey.py), fields joined by "|", email in lower case:
//!   login    login|<company>|<email>|<device_id>|<ts>
//!   refresh  refresh|<company>|<device_id>|<ts>
use crate::errors::AppError;
use crate::secrets::SecretStore;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};

const KEY_SECRET: &str = "device-key";

pub struct DeviceKey {
    key: SigningKey,
}

impl DeviceKey {
    /// Reads the key from the credential store, or makes and saves a new one. An error means the store is not usable;
    /// the app then signs in without a key (the server accepts that until the provider requires signing).
    pub fn load_or_create(store: &dyn SecretStore) -> Result<Self, AppError> {
        if let Some(text) = store.get(KEY_SECRET)? {
            if let Ok(bytes) = B64.decode(text.trim()) {
                if let Ok(seed) = <[u8; 32]>::try_from(bytes.as_slice()) {
                    return Ok(DeviceKey { key: SigningKey::from_bytes(&seed) });
                }
            }
        }
        let key = SigningKey::generate(&mut rand::rngs::OsRng);
        store.set(KEY_SECRET, &B64.encode(key.to_bytes()))?;
        Ok(DeviceKey { key })
    }

    pub fn public_b64(&self) -> String {
        B64.encode(self.key.verifying_key().to_bytes())
    }

    pub fn sign_b64(&self, message: &str) -> String {
        B64.encode(self.key.sign(message.as_bytes()).to_bytes())
    }

    /// The three fields every sign-in / refresh carries: the public key (so the server can register it the first time),
    /// the time, and the signature.
    pub fn fields(&self, message_for: impl Fn(i64) -> String, now: i64) -> Value {
        json!({ "device_key": self.public_b64(), "ts": now, "sig": self.sign_b64(&message_for(now)) })
    }
}

pub fn login_message(company: &str, email: &str, device_id: &str, ts: i64) -> String {
    format!("login|{company}|{}|{device_id}|{ts}", email.trim().to_lowercase())
}

pub fn refresh_message(company: &str, device_id: &str, ts: i64) -> String {
    format!("refresh|{company}|{device_id}|{ts}")
}

/// Adds the signed fields to a request body.
pub fn merge(body: &mut Value, extra: Value) {
    if let (Some(a), Some(b)) = (body.as_object_mut(), extra.as_object()) {
        for (k, v) in b {
            a.insert(k.clone(), v.clone());
        }
    }
}
