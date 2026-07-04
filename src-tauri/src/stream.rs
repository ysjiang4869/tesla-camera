use percent_encoding::percent_decode_str;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use tauri::http::{header, Request, Response, StatusCode};

/// 自定义视频流协议：内置 asset 协议在 macOS 上对媒体 Range 请求支持不佳
/// （图片正常、<video> 黑屏），这里自行实现按区间读取的 206 响应，
/// seek 时只读对应字节段，也顺带解决大视频 seek 慢的问题。
/// 前端通过 convertFileSrc(path, 'stream') 生成 URL。
pub fn handle(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    match serve(request) {
        Ok(response) => response,
        Err(status) => Response::builder()
            .status(status)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Vec::new())
            .unwrap(),
    }
}

fn content_type(path: &str) -> &'static str {
    if path.to_ascii_lowercase().ends_with(".mp4") {
        "video/mp4"
    } else {
        "application/octet-stream"
    }
}

/// 解析 "bytes=start-end" / "bytes=start-" / "bytes=-suffix"
fn parse_range(raw: &str, total: u64) -> Option<(u64, u64)> {
    let spec = raw.trim().strip_prefix("bytes=")?;
    let (start_raw, end_raw) = spec.split_once('-')?;
    if start_raw.is_empty() {
        let suffix: u64 = end_raw.parse().ok()?;
        if suffix == 0 || total == 0 {
            return None;
        }
        return Some((total.saturating_sub(suffix), total - 1));
    }
    let start: u64 = start_raw.parse().ok()?;
    let end: u64 = if end_raw.is_empty() {
        total.checked_sub(1)?
    } else {
        end_raw.parse().ok()?
    };
    if start > end || start >= total {
        return None;
    }
    Some((start, end.min(total - 1)))
}

fn serve(request: Request<Vec<u8>>) -> Result<Response<Vec<u8>>, StatusCode> {
    let encoded = request.uri().path().trim_start_matches('/');
    let path = percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| StatusCode::BAD_REQUEST)?
        .into_owned();

    let mut file = File::open(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    let total = file
        .metadata()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .len();

    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(|raw| parse_range(raw, total).ok_or(StatusCode::RANGE_NOT_SATISFIABLE))
        .transpose()?;

    let builder = Response::builder()
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_TYPE, content_type(&path));

    let response = match range {
        Some((start, end)) => {
            let length = end - start + 1;
            let mut buffer = vec![0u8; length as usize];
            file.seek(SeekFrom::Start(start))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            file.read_exact(&mut buffer)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{total}"),
                )
                .header(header::CONTENT_LENGTH, length.to_string())
                .body(buffer)
        }
        None => {
            let mut buffer = Vec::with_capacity(total as usize);
            file.read_to_end(&mut buffer)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            builder
                .status(StatusCode::OK)
                .header(header::CONTENT_LENGTH, total.to_string())
                .body(buffer)
        }
    };
    response.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[cfg(test)]
mod tests {
    use super::{handle, parse_range};
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
    use tauri::http::{header, Request};

    /// 模拟 macOS 上 convertFileSrc(path, 'stream') 的完整链路：
    /// stream://localhost/<encodeURIComponent(绝对路径)>
    #[test]
    fn serves_encoded_absolute_path() {
        let path = std::env::temp_dir().join("stream_handler_test.mp4");
        std::fs::write(&path, b"0123456789abcdef").unwrap();
        let encoded = utf8_percent_encode(path.to_str().unwrap(), NON_ALPHANUMERIC).to_string();
        let uri = format!("stream://localhost/{encoded}");

        // WKWebView 首个探测请求
        let request = Request::builder()
            .uri(uri.clone())
            .header(header::RANGE, "bytes=0-1")
            .body(Vec::new())
            .unwrap();
        let response = handle(request);
        assert_eq!(response.status(), 206);
        assert_eq!(response.body(), b"01");
        assert_eq!(
            response.headers().get(header::CONTENT_RANGE).unwrap(),
            "bytes 0-1/16"
        );

        // 区间请求
        let request = Request::builder()
            .uri(uri.clone())
            .header(header::RANGE, "bytes=4-7")
            .body(Vec::new())
            .unwrap();
        let response = handle(request);
        assert_eq!(response.status(), 206);
        assert_eq!(response.body(), b"4567");

        // 无 Range 的整文件请求
        let request = Request::builder().uri(uri).body(Vec::new()).unwrap();
        let response = handle(request);
        assert_eq!(response.status(), 200);
        assert_eq!(response.body().len(), 16);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "video/mp4"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn parses_range_specs() {
        assert_eq!(parse_range("bytes=0-1", 100), Some((0, 1)));
        assert_eq!(parse_range("bytes=10-", 100), Some((10, 99)));
        assert_eq!(parse_range("bytes=-20", 100), Some((80, 99)));
        assert_eq!(parse_range("bytes=0-999", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=5-2", 100), None);
    }
}
