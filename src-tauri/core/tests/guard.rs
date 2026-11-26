use rocketsales_core::guard::{classify, parse_tasklist, parse_tasklist_interactive};

#[test]
fn quiet_computer_is_clear() {
    let p = vec!["explorer.exe".to_string(), "chrome.exe".to_string(), "SnippingTool.exe".to_string()];
    assert!(classify(&p, "Console").is_clear());
}

#[test]
fn finds_remote_and_capture_tools() {
    let p = vec!["AnyDesk.exe".to_string(), "obs64.exe".to_string(), "TeamViewer_Desktop.exe".to_string()];
    let s = classify(&p, "Console");
    assert!(s.findings.iter().any(|f| f.kind == "remote" && f.name == "AnyDesk"));
    assert!(s.findings.iter().any(|f| f.kind == "capture" && f.name == "OBS Studio"));
    assert!(s.findings.iter().any(|f| f.name == "TeamViewer"));
}

#[test]
fn remote_desktop_session_is_noticed() {
    let s = classify(&[], "RDP-Tcp#2");
    assert_eq!(s.findings.len(), 1);
    assert_eq!(s.findings[0].kind, "remote");
}

#[test]
fn reads_tasklist_output() {
    let csv = "\"explorer.exe\",\"1234\",\"Console\",\"1\",\"50,000 K\"\r\n\"AnyDesk.exe\",\"9\",\"Console\",\"1\",\"9 K\"\r\n";
    assert_eq!(parse_tasklist(csv), vec!["explorer.exe", "AnyDesk.exe"]);
}

#[test]
fn installed_but_idle_tools_do_not_count() {
    let csv = "\"UltraViewerService.exe\",\"10\",\"Services\",\"0\",\"12,000 K\"\r\n\"TeamViewer_Service.exe\",\"11\",\"Services\",\"0\",\"9,000 K\"\r\n\"AnyDesk.exe\",\"12\",\"Services\",\"0\",\"9,000 K\"\r\n\"explorer.exe\",\"13\",\"Console\",\"1\",\"50,000 K\"\r\n";
    let names = parse_tasklist_interactive(csv);
    assert_eq!(names, vec!["explorer.exe"]);
    // even if a service name slipped through, it is ignored
    assert!(classify(&["UltraViewerService.exe".to_string()], "Console").is_clear());
    // a tool in the person's own session still counts
    let live = "\"AnyDesk.exe\",\"12\",\"Console\",\"1\",\"9,000 K\"\r\n";
    assert_eq!(classify(&parse_tasklist_interactive(live), "Console").findings.len(), 1);
}
