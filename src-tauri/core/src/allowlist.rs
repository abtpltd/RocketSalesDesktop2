//! The "classic" window shows the existing web pages. It may only ever show the company's own site
//! (and its sub-domains, used for sign-in redirects). Everything else is refused.
use crate::errors::AppError;
use url::Url;

pub fn is_allowed(url: &Url, base: &Url) -> bool {
    let scheme_ok = url.scheme() == base.scheme() && (url.scheme() == "https" || url.scheme() == "http");
    if !scheme_ok || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    if url.port_or_known_default() != base.port_or_known_default() {
        return false;
    }
    match (url.host_str(), base.host_str()) {
        (Some(host), Some(company_host)) => {
            let host = host.to_ascii_lowercase();
            let company_host = company_host.to_ascii_lowercase();
            host == company_host || host.ends_with(&format!(".{company_host}"))
        }
        _ => false,
    }
}

/// Turns a menu path such as "/OrderGrid?x=1" into a full address on the company's site.
pub fn classic_url(base: &Url, path: &str) -> Result<Url, AppError> {
    let bad = || AppError::new("bad_path", "That page address is not allowed.");
    if !path.starts_with('/') || path.starts_with("//") || path.contains('\\') || path.chars().any(|c| c.is_control()) {
        return Err(bad());
    }
    let url = base.join(path).map_err(|_| bad())?;
    if is_allowed(&url, base) {
        Ok(url)
    } else {
        Err(bad())
    }
}
