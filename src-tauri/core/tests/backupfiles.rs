use rocketsales_core::backupfiles::{prune, save, valid_name, valid_secret_name};
use std::fs;

fn tmp(tag: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("rs-backup-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    d
}

#[test]
fn only_our_plain_names_are_accepted() {
    assert!(valid_name("RocketSales-auto-2026-10-27.rspres"));
    for bad in ["x.rspres", "RocketSales-auto-2026.txt", "RocketSales-auto-../x.rspres", "RocketSales-auto-a/b.rspres", "RocketSales-auto-a b.rspres", "RocketSales-auto-..rspres"] {
        assert!(!valid_name(bad), "{bad}");
    }
    assert!(valid_secret_name("presentation-backup|acme|boss@acme.com"));
    assert!(!valid_secret_name("refresh-token") && !valid_secret_name("presentation-backup|a b"));
}

#[test]
fn keeps_the_newest_five_and_leaves_other_files_alone() {
    let d = tmp("keep");
    fs::create_dir_all(&d).unwrap();
    fs::write(d.join("notes.txt"), b"mine").unwrap();
    for day in 1..=8 {
        save(&d, &format!("RocketSales-auto-2026-10-{day:02}.rspres"), b"data", 5).unwrap();
    }
    let mut left: Vec<String> = fs::read_dir(&d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
    left.sort();
    assert_eq!(left.len(), 6); // five backups and the other file
    assert!(left.contains(&"notes.txt".to_string()));
    assert!(left.contains(&"RocketSales-auto-2026-10-08.rspres".to_string()));
    assert!(!left.contains(&"RocketSales-auto-2026-10-03.rspres".to_string()));
    prune(&d, 2);
    assert_eq!(fs::read_dir(&d).unwrap().count(), 3);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn refuses_bad_names_and_oversize_and_replaces_the_same_day() {
    let d = tmp("bad");
    assert!(save(&d, "../evil.rspres", b"x", 5).is_err());
    save(&d, "RocketSales-auto-2026-10-27.rspres", b"one", 5).unwrap();
    save(&d, "RocketSales-auto-2026-10-27.rspres", b"two", 5).unwrap();
    assert_eq!(fs::read(d.join("RocketSales-auto-2026-10-27.rspres")).unwrap(), b"two");
    assert_eq!(fs::read_dir(&d).unwrap().count(), 1);
    let _ = fs::remove_dir_all(&d);
}
