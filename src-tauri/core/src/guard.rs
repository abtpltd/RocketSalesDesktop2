//! Spots remote-control and screen-recording tools running on the computer. Pure functions: the list of running
//! program names comes from the caller, so this can be tested anywhere. All free: no outside service involved.

use serde::Serialize;

/// Programs that let someone else see or control this computer.
const REMOTE: &[(&str, &str)] = &[
    ("anydesk", "AnyDesk"),
    ("teamviewer", "TeamViewer"),
    ("rustdesk", "RustDesk"),
    ("ultraviewer", "UltraViewer"),
    ("remoting_host", "Chrome Remote Desktop"),
    ("parsecd", "Parsec"),
    ("strwinclt", "Splashtop"),
    ("logmein", "LogMeIn"),
    ("winvnc", "VNC"),
    ("tvnserver", "VNC"),
    ("vncserver", "VNC"),
    ("ammyy", "Ammyy"),
    ("supremo", "Supremo"),
    ("screenconnect", "ScreenConnect"),
    ("dwagent", "DWService"),
    ("msra", "Remote Assistance"),
    ("quickassist", "Quick Assist"),
    ("aweray", "AweSun"),
    ("todesk", "ToDesk"),
];

/// Programs that record or capture the screen.
const CAPTURE: &[(&str, &str)] = &[
    ("obs64", "OBS Studio"),
    ("obs32", "OBS Studio"),
    ("bdcam", "Bandicam"),
    ("camtasia", "Camtasia"),
    ("snagit", "Snagit"),
    ("sharex", "ShareX"),
    ("screentogif", "ScreenToGif"),
    ("fraps", "Fraps"),
    ("xsplit", "XSplit"),
    ("loom", "Loom"),
    ("apowersoft", "Apowersoft"),
    ("icecreamscreen", "Icecream Screen Recorder"),
    ("flashbackrecorder", "FlashBack"),
    ("screenrec", "ScreenRec"),
    ("gyazo", "Gyazo"),
    ("lightshot", "Lightshot"),
    ("greenshot", "Greenshot"),
    ("action!", "Action!"),
    ("dxtory", "Dxtory"),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Finding {
    /// "remote" or "capture"
    pub kind: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
pub struct Scan {
    pub findings: Vec<Finding>,
}

impl Scan {
    pub fn is_clear(&self) -> bool {
        self.findings.is_empty()
    }
}

fn stem(process: &str) -> String {
    let lower = process.trim().trim_matches('"').to_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

/// `processes`: program file names (for example "AnyDesk.exe"). `session_name`: the Windows SESSIONNAME
/// ("Console" at the desk, "RDP-Tcp#3" over Remote Desktop).
pub fn classify(processes: &[String], session_name: &str) -> Scan {
    let mut findings: Vec<Finding> = Vec::new();
    let mut add = |kind: &str, name: &str| {
        if !findings.iter().any(|f| f.kind == kind && f.name == name) {
            findings.push(Finding { kind: kind.into(), name: name.into() });
        }
    };
    if session_name.trim().to_uppercase().starts_with("RDP-") {
        add("remote", "Windows Remote Desktop");
    }
    for p in processes {
        let s = stem(p);
        if s.is_empty() || s.contains("service") || s.ends_with("svc") {
            continue; // a background service is not a person at the screen
        }
        for (needle, label) in REMOTE {
            if s.starts_with(needle) {
                add("remote", label);
            }
        }
        for (needle, label) in CAPTURE {
            if s.starts_with(needle) {
                add("capture", label);
            }
        }
    }
    Scan { findings }
}

/// Reads the program names out of `tasklist /FO CSV /NH` output.
pub fn parse_tasklist(csv: &str) -> Vec<String> {
    csv.lines()
        .filter_map(|l| {
            let l = l.trim();
            let first = l.strip_prefix('"')?.split("\",\"").next()?;
            Some(first.to_string())
        })
        .collect()
}

/// Only programs running in a person's own desktop session. Background services (session "Services") are left out:
/// a remote tool that is merely installed keeps a service running all the time, and that is not someone watching.
pub fn parse_tasklist_interactive(csv: &str) -> Vec<String> {
    csv.lines()
        .filter_map(|l| {
            let mut cols = l.trim().strip_prefix('"')?.split("\",\"");
            let name = cols.next()?;
            let _pid = cols.next()?;
            let session = cols.next().unwrap_or("");
            if session.eq_ignore_ascii_case("services") {
                return None;
            }
            Some(name.to_string())
        })
        .collect()
}
