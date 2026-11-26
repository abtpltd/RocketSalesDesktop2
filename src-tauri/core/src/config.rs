//! Where the company's server is. A company (tenant) name alone means https://<company>.rocketsalespharma.net.
//! A full address such as medcure.rocketsalespharma.net is accepted when its domain is on the trusted list.
//! Another pattern or more trusted domains go in config.json in the app data folder:
//!   { "base_url_template": "https://{company}.example.com", "allowed_domains": ["example.com"] }
use crate::errors::AppError;
use serde::Deserialize;
use url::Url;

pub const DEFAULT_TEMPLATE: &str = "https://{company}.rocketsalespharma.net";

/// Domains whose company sites the app trusts when the person types a full address.
pub const DEFAULT_DOMAINS: [&str; 2] = ["rocketsalespharma.net", "rocketorder.net"];

fn default_template() -> String {
    DEFAULT_TEMPLATE.to_string()
}

fn default_domains() -> Vec<String> {
    DEFAULT_DOMAINS.iter().map(|d| d.to_string()).collect()
}

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_template")]
    pub base_url_template: String,
    #[serde(default = "default_domains")]
    pub allowed_domains: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Config { base_url_template: default_template(), allowed_domains: default_domains() }
    }
}

impl Config {
    /// A broken or missing file means the default; the app must still start.
    pub fn from_json(text: &str) -> Config {
        serde_json::from_str::<Config>(text).unwrap_or_default()
    }

    /// What the person typed in the Company box: a company name, or a full address like
    /// "medcure.rocketsalespharma.net" (a pasted https:// link is fine). Returns the company name and server.
    pub fn resolve(&self, input: &str) -> Result<(String, Url), AppError> {
        let mut text = input.trim().to_ascii_lowercase();
        if let Some(rest) = text.strip_prefix("https://") {
            text = rest.to_string();
        }
        let host = text.split(['/', '?', '#']).next().unwrap_or("").to_string();
        if !host.contains('.') {
            let company = normalize_company(&host)?;
            let base = self.base_url(&company)?;
            return Ok((company, base));
        }
        let (label, domain) = host.split_once('.').unwrap_or(("", ""));
        let company = normalize_company(label)?;
        if !self.domain_trusted(domain) {
            return Err(AppError::new(
                "bad_company",
                "That server address is not one the app trusts. Enter the company name, or ask your administrator for the address.",
            ));
        }
        let url = Url::parse(&format!("https://{company}.{domain}/"))
            .map_err(|_| AppError::new("bad_company", "That server address is not valid."))?;
        Ok((company, url))
    }

    fn domain_trusted(&self, domain: &str) -> bool {
        if self.allowed_domains.iter().any(|d| d.eq_ignore_ascii_case(domain)) {
            return true;
        }
        // the domain of the configured template counts too (for example a company's own test server)
        match self.base_url("x").ok().and_then(|u| u.host_str().map(|h| h.to_string())) {
            Some(h) => h.split_once('.').map(|(_, rest)| rest.eq_ignore_ascii_case(domain)).unwrap_or(false),
            None => false,
        }
    }

    /// A server address saved at sign-in is checked again before it is used.
    pub fn check_stored(&self, company: &str, saved: &str) -> Result<Url, AppError> {
        let url = Url::parse(saved).map_err(|_| AppError::new("bad_config", "The saved server address is not valid."))?;
        if let Ok(templated) = self.base_url(company) {
            if templated == url {
                return Ok(url);
            }
        }
        let host = url.host_str().unwrap_or("").to_string();
        let (resolved_company, resolved) = self.resolve(&host)?;
        if resolved_company == company && url.scheme() == "https" && resolved.host_str() == url.host_str() {
            Ok(resolved)
        } else {
            Err(AppError::new("bad_config", "The saved server address does not match the company."))
        }
    }

    pub fn base_url(&self, company: &str) -> Result<Url, AppError> {
        let company = normalize_company(company)?;
        let text = self.base_url_template.replace("{company}", &company);
        let url = Url::parse(&text)
            .map_err(|_| AppError::new("bad_config", "The server address in config.json is not valid."))?;
        let host = url.host_str().unwrap_or("").to_string();
        let local = host == "localhost" || host.ends_with(".localhost") || host == "127.0.0.1" || host == "[::1]";
        let scheme_ok = url.scheme() == "https" || (url.scheme() == "http" && local);
        if !scheme_ok || host.is_empty() || !url.username().is_empty() || url.password().is_some() {
            return Err(AppError::new("bad_config", "The server address must be https (http only for localhost)."));
        }
        Ok(url)
    }
}

/// Company names are used as a host label, so only letters, digits and hyphens are allowed.
pub fn normalize_company(raw: &str) -> Result<String, AppError> {
    let company = raw.trim().to_ascii_lowercase();
    let valid = !company.is_empty()
        && company.len() <= 40
        && !company.starts_with('-')
        && !company.ends_with('-')
        && company.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if valid {
        Ok(company)
    } else {
        Err(AppError::new("bad_company", "Enter the company name as your administrator gave it (letters and numbers)."))
    }
}
