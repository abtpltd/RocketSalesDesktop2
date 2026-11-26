//! HTTP to the server: a small Transport trait (so tests need no network), the reqwest implementation,
//! and the translation of the server's JSON envelope into data or an AppError.
use crate::errors::AppError;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Method {
    Get,
    Post,
}

#[derive(Debug, Clone)]
pub struct HttpRequest {
    pub method: Method,
    pub url: String,
    pub bearer: Option<String>,
    pub json_body: Option<Value>,
    pub timeout: Duration,
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TransportError {
    /// Could not reach the server at all.
    Offline(String),
    /// Reached it but it did not answer in time.
    Timeout,
    Other(String),
}

pub trait Transport: Send + Sync {
    fn send(&self, req: HttpRequest) -> impl std::future::Future<Output = Result<HttpResponse, TransportError>> + Send;
}

pub struct ReqwestTransport {
    client: reqwest::Client,
}

impl ReqwestTransport {
    pub fn new(user_agent: &str) -> Result<Self, AppError> {
        let client = reqwest::Client::builder()
            .user_agent(user_agent)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| AppError::internal(e.to_string()))?;
        Ok(ReqwestTransport { client })
    }
}

/// The whole cause chain ("error sending request ... : dns error: ... "), so a failure can be diagnosed from the screen.
fn describe(e: &reqwest::Error) -> String {
    use std::error::Error;
    let mut parts = vec![e.to_string()];
    let mut source = e.source();
    while let Some(s) = source {
        parts.push(s.to_string());
        source = s.source();
    }
    parts.dedup();
    parts.join(": ")
}

impl Transport for ReqwestTransport {
    async fn send(&self, req: HttpRequest) -> Result<HttpResponse, TransportError> {
        let mut builder = match req.method {
            Method::Get => self.client.get(&req.url),
            Method::Post => self.client.post(&req.url),
        };
        builder = builder.timeout(req.timeout).header("Accept", "application/json");
        if let Some(token) = &req.bearer {
            builder = builder.bearer_auth(token);
        }
        if let Some(body) = &req.json_body {
            builder = builder.json(body);
        }
        match builder.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                match response.bytes().await {
                    Ok(bytes) => Ok(HttpResponse { status, body: bytes.to_vec() }),
                    Err(e) if e.is_timeout() => Err(TransportError::Timeout),
                    Err(e) => Err(TransportError::Offline(describe(&e))),
                }
            }
            Err(e) if e.is_timeout() => Err(TransportError::Timeout),
            Err(e) if e.is_connect() => Err(TransportError::Offline(describe(&e))),
            Err(e) => Err(TransportError::Other(describe(&e))),
        }
    }
}

pub const UNSUPPORTED_MESSAGE: &str = "This server does not have the desktop app address (404 Not Found). \
The server may be an older version; ask your administrator to update it.";

/// `{"ok":true,"data":...}` gives the data; `{"ok":false,"error":{...}}` gives the server's own message.
pub fn parse_envelope(response: &HttpResponse) -> Result<Value, AppError> {
    let parsed: Option<Value> = serde_json::from_slice(&response.body).ok();
    if let Some(Value::Object(map)) = &parsed {
        match map.get("ok").and_then(Value::as_bool) {
            Some(true) => return Ok(map.get("data").cloned().unwrap_or(Value::Null)),
            Some(false) => {
                let error = map.get("error");
                let text = |key: &str| error.and_then(|e| e.get(key)).and_then(Value::as_str).map(str::to_string);
                let code = text("code").unwrap_or_else(|| "unknown".to_string());
                let message = text("message").unwrap_or_else(|| "The server refused the request.".to_string());
                let retry = error.and_then(|e| e.get("retry_after_seconds")).and_then(Value::as_u64);
                // a 404 from the desktop API itself means "the server has no such address"
                let code = if code == "not_found" { "unsupported".to_string() } else { code };
                let mut app_error = AppError::new(&code, message);
                app_error.retry_after_seconds = retry;
                return Err(app_error);
            }
            None => {}
        }
    }
    Err(match response.status {
        404 => AppError::new("unsupported", UNSUPPORTED_MESSAGE),
        401 | 403 => AppError::new("unauthorized", "The server did not accept the sign-in."),
        500..=599 => AppError::new("server_error", "The server had a problem. Try again in a moment."),
        status => AppError::new("unknown", format!("The server sent an answer the app does not understand ({status}).")),
    })
}

pub fn map_transport_error(e: &TransportError) -> AppError {
    match e {
        TransportError::Offline(detail) => AppError::new("offline", detail.clone()),
        TransportError::Timeout => AppError::new("timeout", "The server took too long to answer."),
        TransportError::Other(msg) => AppError::new("network_error", format!("The connection failed: {msg}")),
    }
}
