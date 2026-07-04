use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(untagged)]
pub enum DashcamValue {
    Bool(bool),
    Num(f64),
    #[allow(dead_code)] // 对齐前端 DashcamValue = string|number|boolean，当前 mp4 路径不产生字符串
    Str(String),
}

/// 与前端 model.ts 的 DashcamPoint 逐字段对齐（camelCase 序列化）
#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DashcamPoint {
    pub t: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_seq_no: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_mps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steering_angle: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gear: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub autopilot_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blinker_left: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blinker_right: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brake_pressed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accelerator_pedal: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_signal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accel_x: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accel_y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accel_z: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<BTreeMap<String, DashcamValue>>,
}

struct Mp4Box {
    box_type: [u8; 4],
    start: usize,
    size: usize,
}

fn be_u32(data: &[u8], offset: usize) -> Option<u32> {
    data.get(offset..offset + 4)
        .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

fn be_u64(data: &[u8], offset: usize) -> Option<u64> {
    data.get(offset..offset + 8).map(|b| {
        u64::from_be_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])
    })
}

fn parse_boxes(data: &[u8], start: usize, end: usize) -> Vec<Mp4Box> {
    let mut boxes = Vec::new();
    let mut offset = start;
    while offset + 8 <= end {
        let Some(size32) = be_u32(data, offset) else { break };
        let mut box_size = size32 as usize;
        let box_type = [
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        ];
        let mut header = 8usize;
        if size32 == 1 {
            if offset + 16 > end {
                break;
            }
            let Some(large) = be_u64(data, offset + 8) else { break };
            box_size = large as usize;
            header = 16;
        } else if size32 == 0 {
            box_size = end - offset;
        }
        if box_size < header || offset + box_size > end {
            break;
        }
        boxes.push(Mp4Box {
            box_type,
            start: offset + header,
            size: box_size - header,
        });
        offset += box_size;
    }
    boxes
}

fn find_box(data: &[u8], parent: &Mp4Box, box_type: &[u8; 4]) -> Option<Mp4Box> {
    parse_boxes(data, parent.start, parent.start + parent.size)
        .into_iter()
        .find(|b| &b.box_type == box_type)
}

fn find_top_box(data: &[u8], box_type: &[u8; 4]) -> Option<Mp4Box> {
    parse_boxes(data, 0, data.len())
        .into_iter()
        .find(|b| &b.box_type == box_type)
}

struct VideoTrack {
    mdia: Mp4Box,
    stbl: Mp4Box,
    avcc: Mp4Box,
}

fn find_video_track(data: &[u8], moov: &Mp4Box) -> Option<VideoTrack> {
    let traks: Vec<Mp4Box> = parse_boxes(data, moov.start, moov.start + moov.size)
        .into_iter()
        .filter(|b| &b.box_type == b"trak")
        .collect();
    for trak in traks {
        let Some(mdia) = find_box(data, &trak, b"mdia") else { continue };
        let Some(minf) = find_box(data, &mdia, b"minf") else { continue };
        let Some(stbl) = find_box(data, &minf, b"stbl") else { continue };
        let Some(stsd) = find_box(data, &stbl, b"stsd") else { continue };
        let sample_entries = parse_boxes(data, stsd.start + 8, stsd.start + stsd.size);
        let avc = sample_entries
            .into_iter()
            .find(|b| &b.box_type == b"avc1" || &b.box_type == b"avc3");
        let Some(avc) = avc else { continue };
        // avc1/avc3 sample entry 有 78 字节固定头，其后才是子 box
        let search_start = avc.start + 78;
        if search_start >= avc.start + avc.size {
            continue;
        }
        let avcc = parse_boxes(data, search_start, avc.start + avc.size)
            .into_iter()
            .find(|b| &b.box_type == b"avcC");
        if let Some(avcc) = avcc {
            return Some(VideoTrack { mdia, stbl, avcc });
        }
    }
    None
}

fn parse_frame_durations_ms(data: &[u8], mdia: &Mp4Box, stbl: &Mp4Box) -> Vec<f64> {
    let Some(mdhd) = find_box(data, mdia, b"mdhd") else { return Vec::new() };
    let Some(stts) = find_box(data, stbl, b"stts") else { return Vec::new() };
    let Some(&version) = data.get(mdhd.start) else { return Vec::new() };
    let timescale = if version == 1 {
        be_u32(data, mdhd.start + 20)
    } else {
        be_u32(data, mdhd.start + 12)
    };
    let Some(timescale) = timescale else { return Vec::new() };
    if timescale == 0 {
        return Vec::new();
    }
    let Some(entry_count) = be_u32(data, stts.start + 4) else { return Vec::new() };
    let mut durations = Vec::new();
    let mut offset = stts.start + 8;
    let stts_end = stts.start + stts.size;
    for _ in 0..entry_count {
        if offset + 8 > stts_end {
            break;
        }
        let Some(frame_count) = be_u32(data, offset) else { break };
        let Some(delta) = be_u32(data, offset + 4) else { break };
        let ms = (delta as f64 / timescale as f64) * 1000.0;
        for _ in 0..frame_count {
            durations.push(ms);
        }
        offset += 8;
    }
    durations
}

fn read_varint(bytes: &[u8], start: usize) -> (Option<u128>, usize) {
    let mut value: u128 = 0;
    let mut shift: u32 = 0;
    let mut i = start;
    while i < bytes.len() && shift < 70 {
        let current = bytes[i];
        i += 1;
        value |= ((current & 0x7f) as u128) << shift;
        if current & 0x80 == 0 {
            return (Some(value), i);
        }
        shift += 7;
    }
    (None, i)
}

fn remove_rbsp_escape(bytes: &[u8]) -> Vec<u8> {
    let mut result = Vec::with_capacity(bytes.len());
    for i in 0..bytes.len() {
        if i >= 2 && bytes[i] == 0x03 && bytes[i - 1] == 0x00 && bytes[i - 2] == 0x00 {
            continue;
        }
        result.push(bytes[i]);
    }
    result
}

const MAX_SAFE_INTEGER: u128 = 9007199254740991; // 2^53 - 1，对齐 JS Number.MAX_SAFE_INTEGER

fn to_safe_number(value: u128) -> Option<f64> {
    if value > MAX_SAFE_INTEGER {
        None
    } else {
        Some(value as f64)
    }
}

fn parse_sei_payload(protobuf: &[u8]) -> Option<BTreeMap<u32, f64>> {
    let mut index = 0usize;
    let mut fields: BTreeMap<u32, f64> = BTreeMap::new();
    while index < protobuf.len() {
        let (key, next) = read_varint(protobuf, index);
        let Some(key) = key else { break };
        index = next;
        let field = (key >> 3) as u32;
        let wire = (key & 7) as u8;
        match wire {
            0 => {
                let (value, next) = read_varint(protobuf, index);
                index = next;
                if let Some(value) = value {
                    if let Some(parsed) = to_safe_number(value) {
                        fields.insert(field, parsed);
                    }
                }
            }
            5 => {
                if index + 4 > protobuf.len() {
                    break;
                }
                let raw = [
                    protobuf[index],
                    protobuf[index + 1],
                    protobuf[index + 2],
                    protobuf[index + 3],
                ];
                fields.insert(field, f32::from_le_bytes(raw) as f64);
                index += 4;
            }
            1 => {
                if index + 8 > protobuf.len() {
                    break;
                }
                let mut raw = [0u8; 8];
                raw.copy_from_slice(&protobuf[index..index + 8]);
                fields.insert(field, f64::from_le_bytes(raw));
                index += 8;
            }
            2 => {
                let (len, next) = read_varint(protobuf, index);
                let Some(len) = len else { break };
                let Some(size) = to_safe_number(len) else { break };
                index = next + size as usize;
                if index > protobuf.len() {
                    break;
                }
            }
            _ => break,
        }
    }
    if fields.is_empty() {
        None
    } else {
        Some(fields)
    }
}

/// Tesla 把遥测放在 SEI NAL 中，以 0x42('B')…0x69('i') 为标记，其后是 protobuf 负载
fn parse_sei_fields_from_nal(nal: &[u8]) -> Option<BTreeMap<u32, f64>> {
    if nal.is_empty() || nal[0] & 0x1f != 6 || nal.len() < 6 {
        return None;
    }
    let mut marker_start: isize = -1;
    for i in 3..nal.len() - 1 {
        let current = nal[i];
        if current == 0x42 {
            if marker_start == -1 {
                marker_start = i as isize;
            }
            continue;
        }
        if current == 0x69 && marker_start != -1 {
            let protobuf = remove_rbsp_escape(&nal[i + 1..nal.len() - 1]);
            return parse_sei_payload(&protobuf);
        }
        marker_start = -1;
    }
    None
}

const GEAR_MAP: [&str; 4] = ["P", "D", "R", "N"];
const AUTOPILOT_MAP: [&str; 4] = ["NONE", "SELF_DRIVING", "AUTOSTEER", "TACC"];

fn read_field(fields: &BTreeMap<u32, f64>, field_no: u32) -> Option<f64> {
    fields.get(&field_no).copied().filter(|v| v.is_finite())
}

fn read_field_or(fields: &BTreeMap<u32, f64>, field_no: u32, fallback: f64) -> f64 {
    read_field(fields, field_no).unwrap_or(fallback)
}

fn read_field_bool(fields: &BTreeMap<u32, f64>, field_no: u32) -> bool {
    read_field_or(fields, field_no, 0.0) != 0.0
}

/// 对齐 JS Number.prototype.toFixed 再转回 number 的精度截断
fn to_fixed(value: f64, digits: usize) -> f64 {
    format!("{value:.digits$}").parse().unwrap_or(value)
}

fn derive_turn_signal(left: bool, right: bool) -> Option<String> {
    match (left, right) {
        (true, true) => Some("双闪".to_string()),
        (true, false) => Some("左".to_string()),
        (false, true) => Some("右".to_string()),
        (false, false) => None,
    }
}

fn build_point(fields: &BTreeMap<u32, f64>, time_ms: f64) -> DashcamPoint {
    let speed_mps_raw = read_field_or(fields, 4, 0.0);
    let speed_mps = if speed_mps_raw.abs() < 1e-3 { 0.0 } else { speed_mps_raw };
    let speed = speed_mps * 3.6;
    let accelerator = read_field_or(fields, 5, 0.0);
    let steering = read_field_or(fields, 6, 0.0);
    let blinker_left = read_field_bool(fields, 7);
    let blinker_right = read_field_bool(fields, 8);
    let brake_applied = read_field_bool(fields, 9);
    let gear_raw = read_field_or(fields, 2, 0.0).round() as i64;
    let autopilot_raw = read_field_or(fields, 10, 0.0).round() as i64;

    let gear = GEAR_MAP
        .get(gear_raw.max(0) as usize)
        .filter(|_| gear_raw >= 0)
        .map(|s| s.to_string())
        .unwrap_or_else(|| gear_raw.to_string());
    let autopilot = AUTOPILOT_MAP
        .get(autopilot_raw.max(0) as usize)
        .filter(|_| autopilot_raw >= 0)
        .map(|s| s.to_string())
        .unwrap_or_else(|| autopilot_raw.to_string());

    let mut point = DashcamPoint {
        t: time_ms.round().max(0.0) as i64,
        metadata_version: read_field(fields, 1),
        frame_seq_no: read_field(fields, 3),
        speed_mps: Some(speed_mps),
        speed: Some(speed),
        accelerator_pedal: Some(accelerator),
        steering_angle: Some(steering),
        gear: Some(gear),
        autopilot_state: Some(autopilot),
        blinker_left: Some(blinker_left),
        blinker_right: Some(blinker_right),
        brake_pressed: Some(brake_applied),
        turn_signal: derive_turn_signal(blinker_left, blinker_right),
        heading: read_field(fields, 13),
        latitude: read_field(fields, 11),
        longitude: read_field(fields, 12),
        accel_x: read_field(fields, 14),
        accel_y: read_field(fields, 15),
        accel_z: read_field(fields, 16),
        ..Default::default()
    };

    let mut values: BTreeMap<String, DashcamValue> = BTreeMap::new();
    for (field_no, value) in fields {
        values.insert(format!("f{field_no}"), DashcamValue::Num(*value));
    }
    values.insert(
        "vehicle_speed_mps".into(),
        DashcamValue::Num(to_fixed(speed_mps, 6)),
    );
    values.insert(
        "vehicle_speed_kmh".into(),
        DashcamValue::Num(to_fixed(speed, 3)),
    );
    values.insert(
        "accelerator_pedal_position".into(),
        DashcamValue::Num(to_fixed(accelerator, 3)),
    );
    values.insert(
        "steering_wheel_angle".into(),
        DashcamValue::Num(to_fixed(steering, 3)),
    );
    values.insert("blinker_on_left".into(), DashcamValue::Bool(blinker_left));
    values.insert("blinker_on_right".into(), DashcamValue::Bool(blinker_right));
    values.insert("brake_applied".into(), DashcamValue::Bool(brake_applied));
    values.insert("gear_state".into(), DashcamValue::Num(gear_raw as f64));
    values.insert(
        "autopilot_state".into(),
        DashcamValue::Num(autopilot_raw as f64),
    );
    if let Some(v) = point.frame_seq_no {
        values.insert("frame_seq_no".into(), DashcamValue::Num(v));
    }
    if let Some(v) = point.metadata_version {
        values.insert("metadata_version".into(), DashcamValue::Num(v));
    }
    if let Some(v) = point.latitude {
        values.insert("latitude_deg".into(), DashcamValue::Num(to_fixed(v, 7)));
    }
    if let Some(v) = point.longitude {
        values.insert("longitude_deg".into(), DashcamValue::Num(to_fixed(v, 7)));
    }
    if let Some(v) = point.heading {
        values.insert("heading_deg".into(), DashcamValue::Num(to_fixed(v, 4)));
    }
    if let Some(v) = point.accel_x {
        values.insert(
            "linear_acceleration_mps2_x".into(),
            DashcamValue::Num(to_fixed(v, 6)),
        );
    }
    if let Some(v) = point.accel_y {
        values.insert(
            "linear_acceleration_mps2_y".into(),
            DashcamValue::Num(to_fixed(v, 6)),
        );
    }
    if let Some(v) = point.accel_z {
        values.insert(
            "linear_acceleration_mps2_z".into(),
            DashcamValue::Num(to_fixed(v, 6)),
        );
    }
    if !values.is_empty() {
        point.values = Some(values);
    }
    point
}

fn merge_points(mut points: Vec<DashcamPoint>) -> Vec<DashcamPoint> {
    points.sort_by_key(|p| p.t);
    let mut result: Vec<DashcamPoint> = Vec::with_capacity(points.len());
    for item in points {
        match result.last_mut() {
            Some(prev) if prev.t == item.t => {
                let mut merged_values = prev.values.clone().unwrap_or_default();
                if let Some(item_values) = &item.values {
                    merged_values.extend(item_values.clone());
                }
                let mut merged = item;
                // 对齐 JS {...prev, ...item}：条件赋值的字段在 item 缺失时保留 prev
                merged.heading = merged.heading.or(prev.heading);
                merged.latitude = merged.latitude.or(prev.latitude);
                merged.longitude = merged.longitude.or(prev.longitude);
                merged.accel_x = merged.accel_x.or(prev.accel_x);
                merged.accel_y = merged.accel_y.or(prev.accel_y);
                merged.accel_z = merged.accel_z.or(prev.accel_z);
                merged.values = if merged_values.is_empty() {
                    None
                } else {
                    Some(merged_values)
                };
                *prev = merged;
            }
            _ => result.push(item),
        }
    }
    result
}

pub fn parse_mp4_telemetry(data: &[u8]) -> Vec<DashcamPoint> {
    let Some(moov) = find_top_box(data, b"moov") else { return Vec::new() };
    let Some(mdat) = find_top_box(data, b"mdat") else { return Vec::new() };
    let Some(track) = find_video_track(data, &moov) else { return Vec::new() };
    if track.avcc.size < 5 {
        return Vec::new();
    }
    let nal_length_size = ((data[track.avcc.start + 4] & 0x03) + 1) as usize;
    let frame_durations = parse_frame_durations_ms(data, &track.mdia, &track.stbl);
    let average_duration = if frame_durations.is_empty() {
        1000.0 / 36.0
    } else {
        frame_durations.iter().sum::<f64>() / frame_durations.len() as f64
    };

    let mut points = Vec::new();
    let mut cursor = mdat.start;
    let mdat_end = mdat.start + mdat.size;
    let mut pending_fields: Option<BTreeMap<u32, f64>> = None;
    let mut frame_index = 0usize;
    let mut elapsed_ms = 0.0f64;

    while cursor + nal_length_size <= mdat_end {
        let mut nal_size = 0usize;
        for i in 0..nal_length_size {
            nal_size = (nal_size << 8) + data[cursor + i] as usize;
        }
        cursor += nal_length_size;
        if nal_size < 1 || cursor + nal_size > mdat_end {
            break;
        }
        let nal = &data[cursor..cursor + nal_size];
        let nal_type = nal[0] & 0x1f;
        cursor += nal_size;
        if nal_type == 6 {
            pending_fields = parse_sei_fields_from_nal(nal);
            continue;
        }
        if nal_type == 1 || nal_type == 5 {
            if let Some(fields) = pending_fields.take() {
                points.push(build_point(&fields, elapsed_ms));
            }
            elapsed_ms += frame_durations
                .get(frame_index)
                .copied()
                .unwrap_or(average_duration);
            frame_index += 1;
        }
    }
    merge_points(points)
}

#[cfg(test)]
mod tests {
    /// 对拍辅助：TELEMETRY_FILE=<mp4> cargo test dump_telemetry -- --nocapture
    #[test]
    fn dump_telemetry() {
        let Ok(path) = std::env::var("TELEMETRY_FILE") else {
            return;
        };
        let data = std::fs::read(&path).expect("read mp4");
        let points = super::parse_mp4_telemetry(&data);
        println!("{}", serde_json::to_string(&points).expect("serialize"));
    }
}

#[tauri::command]
pub async fn parse_telemetry(path: String) -> Result<Vec<DashcamPoint>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = fs::read(&path).map_err(|e| e.to_string())?;
        Ok(parse_mp4_telemetry(&data))
    })
    .await
    .map_err(|e| e.to_string())?
}
