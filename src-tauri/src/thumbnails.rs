use serde::Serialize;
use sha1::{Digest, Sha1};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Semaphore;

/// 一次 ffmpeg 进程处理的输入数，摊薄进程冷启动成本
const BATCH_SIZE: usize = 8;
/// 同时运行的 ffmpeg 进程数
const CONCURRENCY: usize = 2;

#[derive(Default)]
pub struct ThumbState {
    generation: AtomicU64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailResult {
    pub video_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_path: Option<String>,
}

fn cache_file_name(video_path: &str) -> String {
    // 保持与旧版 TS 实现一致的 SHA-1 命名，复用已有磁盘缓存
    let mut hasher = Sha1::new();
    hasher.update(video_path.as_bytes());
    let digest = hasher.finalize();
    let mut name = String::with_capacity(44);
    for byte in digest {
        name.push_str(&format!("{byte:02x}"));
    }
    name.push_str(".jpg");
    name
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

async fn run_ffmpeg_batch(
    app: &AppHandle,
    batch: &[(String, PathBuf)],
) -> Result<(), String> {
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
    ];
    for (video_path, _) in batch {
        args.push("-ss".into());
        args.push("1".into());
        args.push("-i".into());
        args.push(video_path.clone());
    }
    for (index, (_, cache_path)) in batch.iter().enumerate() {
        args.push("-map".into());
        args.push(format!("{index}:v:0"));
        args.push("-frames:v".into());
        args.push("1".into());
        args.push("-vf".into());
        args.push("scale=224:-1".into());
        args.push("-q:v".into());
        args.push("5".into());
        args.push(cache_path.to_string_lossy().into_owned());
    }
    let command = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args);
    let output = command.output().await.map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

async fn process_batch(
    app: AppHandle,
    batch: Vec<(String, PathBuf)>,
    channel: Channel<ThumbnailResult>,
) {
    // 批量失败（如某个输入损坏）时逐个重试，保证其余缩略图不受影响
    let batch_ok = run_ffmpeg_batch(&app, &batch).await.is_ok();
    for (video_path, cache_path) in batch {
        let mut done = cache_path.exists();
        if !done && !batch_ok {
            done = run_ffmpeg_batch(&app, std::slice::from_ref(&(video_path.clone(), cache_path.clone())))
                .await
                .is_ok()
                && cache_path.exists();
        }
        let _ = channel.send(ThumbnailResult {
            video_path,
            cache_path: done.then(|| cache_path.to_string_lossy().into_owned()),
        });
    }
}

#[tauri::command]
pub async fn request_thumbnails(
    app: AppHandle,
    state: State<'_, ThumbState>,
    paths: Vec<String>,
    on_thumbnail: Channel<ThumbnailResult>,
) -> Result<(), String> {
    let generation = state.generation.load(Ordering::SeqCst);
    let dir = cache_dir(&app)?;

    // 一次列目录建立命中集合，避免逐文件 exists
    let existing: HashSet<String> = std::fs::read_dir(&dir)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();

    let mut misses: Vec<(String, PathBuf)> = Vec::new();
    for path in paths {
        let file_name = cache_file_name(&path);
        let cache_path = dir.join(&file_name);
        if existing.contains(&file_name) {
            let _ = on_thumbnail.send(ThumbnailResult {
                video_path: path,
                cache_path: Some(cache_path.to_string_lossy().into_owned()),
            });
        } else {
            misses.push((path, cache_path));
        }
    }

    let semaphore = Arc::new(Semaphore::new(CONCURRENCY));
    let mut handles = Vec::new();
    for batch in misses.chunks(BATCH_SIZE) {
        let batch = batch.to_vec();
        let app = app.clone();
        let channel = on_thumbnail.clone();
        let semaphore = semaphore.clone();
        handles.push(tauri::async_runtime::spawn(async move {
            let _permit = semaphore.acquire().await;
            // 拿到执行权后再检查是否已被取消（重新选目录会递增 generation）
            let current = app.state::<ThumbState>().generation.load(Ordering::SeqCst);
            if current != generation {
                return;
            }
            process_batch(app, batch, channel).await;
        }));
    }
    for handle in handles {
        let _ = handle.await;
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_thumbnails(state: State<'_, ThumbState>) {
    state.generation.fetch_add(1, Ordering::SeqCst);
}

/// 供导出等场景直接判断缓存文件是否存在（保留给未来使用）
#[allow(dead_code)]
pub fn thumbnail_cache_path(app: &AppHandle, video_path: &str) -> Option<PathBuf> {
    let dir = cache_dir(app).ok()?;
    let path = dir.join(cache_file_name(video_path));
    Path::new(&path).exists().then_some(path)
}
