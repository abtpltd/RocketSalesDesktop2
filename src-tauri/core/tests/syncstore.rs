use rocketsales_core::syncstore::{merge, view, LocalCopy, View};
use serde_json::json;

fn v<'a>(search: &'a str) -> View<'a> {
    View { search, status: "", sort: "", desc: false, page: 1, size: 100 }
}

#[test]
fn first_answer_fills_the_copy_and_later_ones_change_only_what_moved() {
    let first = json!({"full": true, "columns": [{"key":"name","title":"Name"}], "keys_complete": true,
        "keys": ["a","b"], "server_time": 100,
        "rows": [{"key":"a","name":"Alpha","status":"Active"},{"key":"b","name":"Beta","status":"Active"}]});
    let m = merge(&LocalCopy::default(), &first);
    assert_eq!(m.copy.rows.len(), 2);
    assert_eq!(m.copy.last_sync, 100);
    let second = json!({"full": false, "keys_complete": true, "keys": ["a","b","c"], "server_time": 200,
        "rows": [{"key":"b","name":"Beta 2","status":"Active"},{"key":"c","name":"Gamma","status":"Active"}]});
    let m2 = merge(&m.copy, &second);
    assert_eq!((m2.changed, m2.removed, m2.copy.rows.len(), m2.copy.last_sync), (2, 0, 3, 200));
    let third = json!({"full": false, "keys_complete": true, "keys": ["a","c"], "rows": [], "server_time": 300});
    let m3 = merge(&m2.copy, &third);
    assert_eq!((m3.removed, m3.copy.rows.len()), (1, 2));
}

#[test]
fn growing_lists_never_drop_old_rows() {
    let old = LocalCopy { columns: vec![], rows: vec![json!({"key":"a"})], last_sync: 1 };
    let ans = json!({"full": false, "keys_complete": false, "keys": null, "rows": [{"key":"b"}], "server_time": 2});
    assert_eq!(merge(&old, &ans).copy.rows.len(), 2);
}

#[test]
fn search_status_sort_and_paging() {
    let copy = LocalCopy {
        columns: vec![json!({"key":"name","title":"Name"})],
        rows: vec![
            json!({"key":"1","name":"Shop One","mrp":30,"status":"Active"}),
            json!({"key":"2","name":"Shop Two","mrp":5,"status":"Active"}),
            json!({"key":"3","name":"Old shop","mrp":9,"status":"Inactive"}),
        ],
        last_sync: 7,
    };
    let all = view(&copy, "products", &v(""));
    assert_eq!(all["total"], 2); // the first status (active) is shown by default
    assert_eq!(view(&copy, "products", &View { status: "inactive", ..v("") })["total"], 1);
    assert_eq!(view(&copy, "products", &v("two"))["total"], 1);
    let sorted = view(&copy, "products", &View { sort: "mrp", desc: true, ..v("") });
    assert_eq!(sorted["rows"][0]["key"], "1");
    let paged = view(&copy, "products", &View { page: 2, size: 1, ..v("") });
    assert_eq!(paged["rows"][0]["key"], "2");
}
