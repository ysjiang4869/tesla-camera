use chrono::{Local, NaiveDateTime, TimeZone};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanClip {
    pub time: i64,
    pub time_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub front: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub back: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanGroup {
    pub id: String,
    pub title: String,
    pub dir: String,
    pub time: i64,
    /// 与前端 TypeEnum 对齐：0=所有 1=事件 2=哨兵 3=行车记录仪
    #[serde(rename = "type")]
    pub kind: u8,
    pub clips: Vec<ScanClip>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<serde_json::Value>,
}

/// 校验 Tesla 命名前缀 YYYY-MM-DD_HH-MM-SS-，返回 19 位 time key
fn parse_time_key(name: &str) -> Option<&str> {
    let bytes = name.as_bytes();
    if bytes.len() < 21 {
        return None;
    }
    for (i, b) in bytes[..20].iter().enumerate() {
        let ok = match i {
            4 | 7 => *b == b'-',
            10 => *b == b'_',
            13 | 16 | 19 => *b == b'-',
            _ => b.is_ascii_digit(),
        };
        if !ok {
            return None;
        }
    }
    Some(&name[..19])
}

fn time_key_to_millis(key: &str) -> Option<i64> {
    let normalized = key.replacen('_', " ", 1);
    let naive = NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%d %H-%M-%S").ok()?;
    Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|dt| dt.timestamp_millis())
}

fn path_to_kind(path: &str) -> u8 {
    if path.contains("SavedClips") {
        1
    } else if path.contains("SentryClips") {
        2
    } else if path.contains("RecentClips") {
        3
    } else {
        0
    }
}

fn normalize_dir(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if normalized.ends_with('/') {
        normalized
    } else {
        format!("{normalized}/")
    }
}

fn dir_base_name(dir: &str) -> String {
    let trimmed = dir.trim_end_matches('/');
    trimmed
        .rsplit('/')
        .next()
        .unwrap_or(trimmed)
        .to_string()
}

struct WalkResult {
    videos: Vec<(String, String)>, // (dir, file name)
    events: Vec<String>,           // event.json paths
}

fn walk(dir: &Path, out: &mut WalkResult) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            walk(&path, out);
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.eq_ignore_ascii_case("event.json") {
            out.events.push(path.to_string_lossy().into_owned());
        } else if name.to_ascii_lowercase().ends_with(".mp4") && parse_time_key(&name).is_some() {
            out.videos
                .push((dir.to_string_lossy().into_owned(), name.into_owned()));
        }
    }
}

pub fn scan_dir(dir: &str) -> Vec<ScanGroup> {
    {
        let mut result = WalkResult {
            videos: Vec::new(),
            events: Vec::new(),
        };
        walk(Path::new(dir), &mut result);

        // dir -> time_key -> clip
        let mut groups: BTreeMap<String, BTreeMap<String, ScanClip>> = BTreeMap::new();
        for (file_dir, name) in &result.videos {
            let Some(time_key) = parse_time_key(name) else {
                continue;
            };
            let Some(time) = time_key_to_millis(time_key) else {
                continue;
            };
            let dir_key = normalize_dir(file_dir);
            let full_path = format!("{dir_key}{name}");
            let clip = groups
                .entry(dir_key)
                .or_default()
                .entry(time_key.to_string())
                .or_insert_with(|| ScanClip {
                    time,
                    time_key: time_key.to_string(),
                    ..Default::default()
                });
            if name.contains("front") {
                clip.front = Some(full_path);
            } else if name.contains("back") {
                clip.back = Some(full_path);
            } else if name.contains("left_repeater") {
                clip.left = Some(full_path);
            } else if name.contains("right_repeater") {
                clip.right = Some(full_path);
            }
        }

        let mut event_by_dir: BTreeMap<String, serde_json::Value> = BTreeMap::new();
        for event_path in &result.events {
            let normalized = event_path.replace('\\', "/");
            let parent = match normalized.rfind('/') {
                Some(idx) => normalize_dir(&normalized[..idx]),
                None => continue,
            };
            if let Ok(text) = fs::read_to_string(event_path) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    event_by_dir.insert(parent, value);
                }
            }
        }

        let mut output: Vec<ScanGroup> = groups
            .into_iter()
            .map(|(dir_key, clips)| {
                let mut clips: Vec<ScanClip> = clips.into_values().collect();
                clips.sort_by_key(|clip| clip.time);
                let time = clips.iter().map(|c| c.time).min().unwrap_or(0);
                ScanGroup {
                    title: dir_base_name(&dir_key),
                    kind: path_to_kind(&dir_key),
                    time,
                    event: event_by_dir.remove(&dir_key),
                    dir: dir_key.clone(),
                    id: dir_key,
                    clips,
                }
            })
            .collect();
        output.sort_by_key(|group| std::cmp::Reverse(group.time));
        output
    }
}

#[tauri::command]
pub async fn scan_teslacam(dir: String) -> Result<Vec<ScanGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(scan_dir(&dir)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    /// 冒烟：SCAN_DIR=<TeslaCam 目录> cargo test dump_scan -- --nocapture
    #[test]
    fn dump_scan() {
        let Ok(dir) = std::env::var("SCAN_DIR") else {
            return;
        };
        let groups = super::scan_dir(&dir);
        let clip_count: usize = groups.iter().map(|g| g.clips.len()).sum();
        let event_count = groups.iter().filter(|g| g.event.is_some()).count();
        println!(
            "groups={} clips={} events={} first={:?}",
            groups.len(),
            clip_count,
            event_count,
            groups.first().map(|g| (&g.title, g.kind, g.time, g.clips.len()))
        );
    }
}
