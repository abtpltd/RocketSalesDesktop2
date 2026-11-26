//! The app's own copy of a list, kept up to date by asking the server only for what changed (like an incremental
//! refresh in a reporting tool). Pure functions: merging an answer into the copy and searching, sorting and paging it.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct LocalCopy {
    pub columns: Vec<Value>,
    pub rows: Vec<Value>,
    /// the server's clock at the last answer; the next question asks for changes after it
    pub last_sync: i64,
}

fn key_of(row: &Value) -> Option<&str> {
    row.get("key").and_then(|k| k.as_str())
}

#[derive(Debug, Clone, PartialEq)]
pub struct Merged {
    pub copy: LocalCopy,
    pub changed: usize,
    pub removed: usize,
}

/// Puts a "changes since" answer into the copy. A full answer replaces everything. Otherwise changed rows replace
/// or join the old ones, and when the server sent the complete key list, rows it no longer lists are dropped.
pub fn merge(old: &LocalCopy, answer: &Value) -> Merged {
    let new_rows: Vec<Value> = answer.get("rows").and_then(|r| r.as_array()).cloned().unwrap_or_default();
    let full = answer.get("full").and_then(|f| f.as_bool()).unwrap_or(false);
    let columns = answer.get("columns").and_then(|c| c.as_array()).cloned().unwrap_or_else(|| old.columns.clone());
    let server_time = answer.get("server_time").and_then(|t| t.as_i64()).unwrap_or(old.last_sync);
    let mut rows: Vec<Value> = if full { Vec::new() } else { old.rows.clone() };
    let mut changed = 0;
    for row in new_rows {
        let Some(k) = key_of(&row).map(|s| s.to_string()) else { continue };
        match rows.iter().position(|r| key_of(r) == Some(k.as_str())) {
            Some(i) => {
                if rows[i] != row {
                    rows[i] = row;
                    changed += 1;
                }
            }
            None => {
                rows.push(row);
                changed += 1;
            }
        }
    }
    let mut removed = 0;
    if answer.get("keys_complete").and_then(|k| k.as_bool()).unwrap_or(false) {
        if let Some(keys) = answer.get("keys").and_then(|k| k.as_array()) {
            let keep: HashSet<&str> = keys.iter().filter_map(|k| k.as_str()).collect();
            let before = rows.len();
            rows.retain(|r| key_of(r).map_or(false, |k| keep.contains(k)));
            removed = before - rows.len();
        }
    }
    Merged { copy: LocalCopy { columns, rows, last_sync: server_time }, changed, removed }
}

fn cell_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.to_lowercase(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

fn compare(a: &Value, b: &Value, field: &str) -> std::cmp::Ordering {
    let (x, y) = (a.get(field).unwrap_or(&Value::Null), b.get(field).unwrap_or(&Value::Null));
    match (x.as_f64(), y.as_f64()) {
        (Some(p), Some(q)) => p.partial_cmp(&q).unwrap_or(std::cmp::Ordering::Equal),
        _ => cell_text(x).cmp(&cell_text(y)),
    }
}

pub struct View<'a> {
    pub search: &'a str,
    pub status: &'a str,
    pub sort: &'a str,
    pub desc: bool,
    pub page: u32,
    pub size: u32,
}

/// The list page the screens show, in the same shape the server's list answers use.
pub fn view(copy: &LocalCopy, module: &str, v: &View) -> Value {
    let words: Vec<String> = v.search.split_whitespace().map(|w| w.to_lowercase()).collect();
    let mut choices: Vec<String> = copy
        .rows
        .iter()
        .filter_map(|r| r.get("status").and_then(|s| s.as_str()).map(|s| s.to_lowercase()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    choices.sort();
    let wanted = if v.status.is_empty() { choices.first().cloned().unwrap_or_default() } else { v.status.to_lowercase() };
    let mut rows: Vec<&Value> = copy
        .rows
        .iter()
        .filter(|r| {
            let status_ok = wanted.is_empty()
                || r.get("status").and_then(|s| s.as_str()).map_or(true, |s| s.to_lowercase() == wanted);
            let text_ok = words.is_empty() || {
                let hay: String = r.as_object().map(|o| o.iter().filter(|(k, _)| *k != "key").map(|(_, c)| cell_text(c)).collect::<Vec<_>>().join(" ")).unwrap_or_default();
                words.iter().all(|w| hay.contains(w.as_str()))
            };
            status_ok && text_ok
        })
        .collect();
    if !v.sort.is_empty() {
        rows.sort_by(|a, b| {
            let o = compare(a, b, v.sort);
            if v.desc { o.reverse() } else { o }
        });
    }
    let size = v.size.clamp(1, 500) as usize;
    let page = v.page.max(1) as usize;
    let total = rows.len();
    let slice: Vec<Value> = rows.into_iter().skip((page - 1) * size).take(size).cloned().collect();
    let mut out = Map::new();
    out.insert("module".into(), json!(module));
    out.insert("title".into(), json!(""));
    out.insert("path".into(), json!(""));
    out.insert("columns".into(), Value::Array(copy.columns.clone()));
    out.insert("rows".into(), Value::Array(slice));
    out.insert("total".into(), json!(total));
    out.insert("page".into(), json!(page));
    out.insert("size".into(), json!(size));
    out.insert("status".into(), json!(wanted));
    out.insert("status_choices".into(), json!(choices));
    out.insert("server_time".into(), json!(copy.last_sync));
    Value::Object(out)
}
