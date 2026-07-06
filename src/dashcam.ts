import dayjs from 'dayjs'
import { type DashcamPoint, type DashcamValue } from './model'

const CLIP_PREFIX_REG = /([0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2})/

type FieldKey = keyof Omit<DashcamPoint, 't' | 'values'>

interface FieldSpec {
  key: FieldKey
  aliases: string[]
  label: string
  unit?: string
  digits?: number
}

const FIELD_SPECS: FieldSpec[] = [
  { key: 'metadataVersion', aliases: ['metadata_version', 'version'], label: '元数据版本' },
  { key: 'frameSeqNo', aliases: ['frame_seq_no', 'frame_seq'], label: '帧序号' },
  { key: 'speedMps', aliases: ['vehicle_speed_mps', 'speed_mps'], label: '速度', unit: 'm/s', digits: 2 },
  { key: 'speed', aliases: ['speed', 'speedkph', 'vehicle_speed', 'gps_speed', 'veh_speed'], label: '车速', unit: 'km/h', digits: 0 },
  { key: 'steeringAngle', aliases: ['steeringangle', 'steering_angle', 'steering', 'steer_angle', 'steering_wheel_angle'], label: '方向盘', unit: '°', digits: 1 },
  { key: 'gear', aliases: ['gear', 'selectedgear', 'gear_state'], label: '档位' },
  { key: 'autopilotState', aliases: ['autopilot_state', 'autopilot', 'ap_state'], label: '辅助驾驶' },
  { key: 'brakePressed', aliases: ['brake', 'brake_pressed', 'is_braking', 'brake_applied'], label: '刹车' },
  { key: 'acceleratorPedal', aliases: ['accelerator', 'accelerator_pedal', 'throttle', 'pedal', 'accelerator_pedal_position'], label: '电门', unit: '%', digits: 1 },
  { key: 'blinkerLeft', aliases: ['blinker_on_left', 'left_blinker', 'turn_left'], label: '左转灯' },
  { key: 'blinkerRight', aliases: ['blinker_on_right', 'right_blinker', 'turn_right'], label: '右转灯' },
  { key: 'turnSignal', aliases: ['turnsignal', 'turn_signal', 'signal'], label: '转向灯' },
  { key: 'heading', aliases: ['heading', 'yaw', 'course', 'heading_deg'], label: '航向', unit: '°', digits: 1 },
  { key: 'latitude', aliases: ['latitude', 'lat', 'gpslat', 'latitude_deg'], label: '纬度', digits: 6 },
  { key: 'longitude', aliases: ['longitude', 'lon', 'lng', 'gpslon', 'longitude_deg'], label: '经度', digits: 6 },
  { key: 'elevation', aliases: ['elevation', 'altitude', 'height'], label: '海拔', unit: 'm', digits: 1 },
  { key: 'accelX', aliases: ['accelx', 'accel_x', 'ax'], label: '加速度X', unit: 'm/s2', digits: 2 },
  { key: 'accelY', aliases: ['accely', 'accel_y', 'ay'], label: '加速度Y', unit: 'm/s2', digits: 2 },
  { key: 'accelZ', aliases: ['accelz', 'accel_z', 'az'], label: '加速度Z', unit: 'm/s2', digits: 2 },
  { key: 'pitch', aliases: ['pitch'], label: '俯仰', unit: '°', digits: 2 },
  { key: 'roll', aliases: ['roll'], label: '横滚', unit: '°', digits: 2 },
  { key: 'yawRate', aliases: ['yawrate', 'yaw_rate'], label: '偏航角速度', unit: '°/s', digits: 2 },
  { key: 'odometer', aliases: ['odometer', 'odo'], label: '里程', unit: 'km', digits: 1 },
  { key: 'batteryLevel', aliases: ['battery', 'battery_level', 'soc'], label: '电量', unit: '%', digits: 1 },
  { key: 'powerKw', aliases: ['power', 'power_kw'], label: '功率', unit: 'kW', digits: 1 },
]

const FIELD_BY_ALIAS = FIELD_SPECS.reduce<Record<string, FieldSpec>>((prev, spec) => {
  spec.aliases.forEach((alias) => {
    prev[normalizeKey(alias)] = spec
  })
  return prev
}, {})

const TIME_KEYS = new Set(['time', 'timestamp', 'ts', 'time_ms', 'elapsed', 'elapsed_s', 'pts', 'sample_time'])
const INTERNAL_EXTRA_KEYS = new Set([
  'vehicle_speed_mps',
  'vehicle_speed_kmh',
  'accelerator_pedal_position',
  'steering_wheel_angle',
  'blinker_on_left',
  'blinker_on_right',
  'brake_applied',
  'gear_state',
  'autopilot_state',
  'frame_seq_no',
  'metadata_version',
  'latitude_deg',
  'longitude_deg',
  'heading_deg',
  'linear_acceleration_mps2_x',
  'linear_acceleration_mps2_y',
  'linear_acceleration_mps2_z',
])

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const num = Number(value.trim())
    if (Number.isFinite(num)) {
      return num
    }
  }
  return undefined
}

function toDashcamValue(value: unknown): DashcamValue | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) {
      return undefined
    }
    const lower = raw.toLowerCase()
    if (['true', 'yes', 'on'].includes(lower)) {
      return true
    }
    if (['false', 'no', 'off'].includes(lower)) {
      return false
    }
    const num = Number(raw)
    if (Number.isFinite(num)) {
      return num
    }
    return raw
  }
  return undefined
}

function normalizeTimeMs(raw: unknown, clipStartMs: number): number | undefined {
  if (typeof raw === 'string' && raw.includes('-')) {
    const parsed = dayjs(raw).valueOf()
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed - clipStartMs)
    }
  }
  const num = toNumber(raw)
  if (num === undefined) {
    return undefined
  }
  if (num > 1e12) {
    return Math.max(0, num - clipStartMs)
  }
  if (num > 1e9) {
    return Math.max(0, num * 1000 - clipStartMs)
  }
  if (num > 1e6) {
    return Math.max(0, num)
  }
  return Math.max(0, num * 1000)
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
      continue
    }
    if (ch === ',' && !inQuote) {
      result.push(current)
      current = ''
      continue
    }
    current += ch
  }
  result.push(current)
  return result
}

function parseRecordFields(record: Record<string, unknown>): Omit<DashcamPoint, 't'> | undefined {
  const point: Omit<DashcamPoint, 't'> = {}
  const values: Record<string, DashcamValue> = {}
  const assignKnownField = (key: FieldKey, val: DashcamValue) => {
    switch (key) {
      case 'speed':
        point.speed = val as number
        break
      case 'speedMps':
        point.speedMps = val as number
        if (point.speed === undefined) {
          point.speed = (val as number) * 3.6
        }
        break
      case 'steeringAngle':
        point.steeringAngle = val as number
        break
      case 'gear':
        point.gear = val as string | number
        break
      case 'autopilotState':
        point.autopilotState = val as string | number
        break
      case 'brakePressed':
        point.brakePressed = val as boolean | string | number
        break
      case 'acceleratorPedal':
        point.acceleratorPedal = val as number
        break
      case 'blinkerLeft':
        point.blinkerLeft = Boolean(val)
        break
      case 'blinkerRight':
        point.blinkerRight = Boolean(val)
        break
      case 'turnSignal':
        point.turnSignal = val as string | number
        break
      case 'metadataVersion':
        point.metadataVersion = val as number
        break
      case 'frameSeqNo':
        point.frameSeqNo = val as number
        break
      case 'heading':
        point.heading = val as number
        break
      case 'latitude':
        point.latitude = val as number
        break
      case 'longitude':
        point.longitude = val as number
        break
      case 'elevation':
        point.elevation = val as number
        break
      case 'accelX':
        point.accelX = val as number
        break
      case 'accelY':
        point.accelY = val as number
        break
      case 'accelZ':
        point.accelZ = val as number
        break
      case 'pitch':
        point.pitch = val as number
        break
      case 'roll':
        point.roll = val as number
        break
      case 'yawRate':
        point.yawRate = val as number
        break
      case 'odometer':
        point.odometer = val as number
        break
      case 'batteryLevel':
        point.batteryLevel = val as number
        break
      case 'powerKw':
        point.powerKw = val as number
        break
      default:
      //
    }
  }
  Object.keys(record).forEach((rawKey) => {
    const normalized = normalizeKey(rawKey)
    if (!normalized || TIME_KEYS.has(normalized)) {
      return
    }
    const val = toDashcamValue(record[rawKey])
    if (val === undefined) {
      return
    }
    const spec = FIELD_BY_ALIAS[normalized]
    if (spec) {
      assignKnownField(spec.key, val)
      return
    }
    values[rawKey] = val
  })
  if (Object.keys(values).length) {
    point.values = values
  }
  if (point.turnSignal === undefined) {
    point.turnSignal = deriveTurnSignal(point.blinkerLeft, point.blinkerRight)
  }
  const hasKnown = FIELD_SPECS.some(spec => point[spec.key] !== undefined)
  if (!hasKnown && !point.values) {
    return undefined
  }
  return point
}

function deriveTurnSignal(left?: boolean, right?: boolean): string | undefined {
  if (left && right) {
    return '双闪'
  }
  if (left) {
    return '左'
  }
  if (right) {
    return '右'
  }
  return undefined
}

function parseCsv(text: string, clipStartMs: number): DashcamPoint[] {
  const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (rows.length < 2) {
    return []
  }
  const headers = parseCsvLine(rows[0]).map(item => item.trim())
  const normalizedHeaders = headers.map(item => normalizeKey(item))
  const timeIndex = normalizedHeaders.findIndex(item => TIME_KEYS.has(item))
  const points: DashcamPoint[] = []
  for (let i = 1; i < rows.length; i++) {
    const cols = parseCsvLine(rows[i])
    const record = headers.reduce<Record<string, unknown>>((prev, header, idx) => {
      prev[header] = cols[idx]
      return prev
    }, {})
    const data = parseRecordFields(record)
    if (!data) {
      continue
    }
    const timeRaw = timeIndex > -1 ? cols[timeIndex] : i - 1
    const t = normalizeTimeMs(timeRaw, clipStartMs) ?? (i - 1) * 1000
    points.push({ t, ...data })
  }
  return points
}

function findTimeValue(record: Record<string, unknown>): unknown {
  const entries = Object.entries(record)
  for (let i = 0; i < entries.length; i++) {
    if (TIME_KEYS.has(normalizeKey(entries[i][0]))) {
      return entries[i][1]
    }
  }
  return undefined
}

function walkJson(node: unknown, clipStartMs: number, points: DashcamPoint[], parentTime?: number) {
  if (Array.isArray(node)) {
    node.forEach(item => walkJson(item, clipStartMs, points, parentTime))
    return
  }
  if (!node || typeof node !== 'object') {
    return
  }
  const record = node as Record<string, unknown>
  const currentTime = normalizeTimeMs(findTimeValue(record), clipStartMs) ?? parentTime
  const parsed = parseRecordFields(record)
  if (parsed) {
    points.push({
      t: currentTime ?? (points.length > 0 ? points[points.length - 1].t + 1000 : 0),
      ...parsed,
    })
  }
  Object.keys(record).forEach((key) => {
    walkJson(record[key], clipStartMs, points, currentTime)
  })
}

function parseJson(text: string, clipStartMs: number): DashcamPoint[] {
  try {
    const parsed = JSON.parse(text)
    const points: DashcamPoint[] = []
    walkJson(parsed, clipStartMs, points)
    return points
  } catch {
    return []
  }
}

export function mergeDashcamPoints(...groups: Array<DashcamPoint[] | undefined>): DashcamPoint[] {
  const all = groups.flatMap(group => group ?? [])
  const sorted = [...all].sort((a, b) => a.t - b.t)
  const result: DashcamPoint[] = []
  sorted.forEach((item) => {
    const prev = result[result.length - 1]
    if (!prev || prev.t !== item.t) {
      result.push(item)
      return
    }
    const values = { ...(prev.values ?? {}), ...(item.values ?? {}) }
    result[result.length - 1] = {
      ...prev,
      ...item,
      values: Object.keys(values).length ? values : undefined,
    }
  })
  return result
}

function fmtTimestamp(ms: number): string {
  const t = Math.max(0, Math.floor(ms))
  const hours = Math.floor(t / 3600000)
  const minutes = Math.floor((t % 3600000) / 60000)
  const seconds = Math.floor((t % 60000) / 1000)
  const millis = t % 1000
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const mmm = String(millis).padStart(3, '0')
  return `${hh}:${mm}:${ss},${mmm}`
}

function formatValue(value: DashcamValue, digits?: number): string {
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (typeof value === 'number') {
    if (digits !== undefined) {
      return value.toFixed(digits)
    }
    return String(value)
  }
  return value
}

function formatBySpec(point: DashcamPoint): string[] {
  const chunks: string[] = []
  FIELD_SPECS.forEach((spec) => {
    const value = point[spec.key]
    if (value === undefined) {
      return
    }
    const formatted = formatValue(value, spec.digits)
    chunks.push(spec.unit ? `${spec.label} ${formatted} ${spec.unit}` : `${spec.label} ${formatted}`)
  })
  return chunks
}

function formatExtraValues(point: DashcamPoint): string[] {
  const values = point.values ?? {}
  return Object.keys(values)
    .filter(key => !/^f\d+$/.test(key) && !INTERNAL_EXTRA_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b))
    .map(key => `${key} ${formatValue(values[key])}`)
}

interface Mp4Box {
  type: string
  start: number
  size: number
  boxSize: number
}

function parseMp4Boxes(data: DataView, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    let boxSize = data.getUint32(offset)
    const type = String.fromCharCode(
      data.getUint8(offset + 4),
      data.getUint8(offset + 5),
      data.getUint8(offset + 6),
      data.getUint8(offset + 7),
    )
    let header = 8
    if (boxSize === 1) {
      if (offset + 16 > end) {
        break
      }
      const largeSize = Number(data.getBigUint64(offset + 8))
      boxSize = largeSize
      header = 16
    } else if (boxSize === 0) {
      boxSize = end - offset
    }
    if (boxSize < header || offset + boxSize > end) {
      break
    }
    boxes.push({
      type,
      start: offset + header,
      size: boxSize - header,
      boxSize,
    })
    offset += boxSize
  }
  return boxes
}

function findBox(data: DataView, parent: Mp4Box, type: string): Mp4Box | undefined {
  return parseMp4Boxes(data, parent.start, parent.start + parent.size).find(item => item.type === type)
}

function findTopBox(data: DataView, type: string): Mp4Box | undefined {
  return parseMp4Boxes(data, 0, data.byteLength).find(item => item.type === type)
}

function readVarint(bytes: Uint8Array, start: number): { value?: bigint; next: number } {
  let value = 0n
  let shift = 0n
  let i = start
  while (i < bytes.length && shift < 70n) {
    const current = bytes[i++]
    value |= BigInt(current & 0x7f) << shift
    if ((current & 0x80) === 0) {
      return { value, next: i }
    }
    shift += 7n
  }
  return { next: i }
}

function removeRbspEscape(bytes: Uint8Array): Uint8Array {
  const result: number[] = []
  for (let i = 0; i < bytes.length; i++) {
    if (i >= 2 && bytes[i] === 0x03 && bytes[i - 1] === 0x00 && bytes[i - 2] === 0x00) {
      continue
    }
    result.push(bytes[i])
  }
  return new Uint8Array(result)
}

function toSafeNumber(value: bigint): number | undefined {
  const abs = value < 0 ? -value : value
  if (abs > BigInt(Number.MAX_SAFE_INTEGER)) {
    return undefined
  }
  return Number(value)
}

function parseSeiPayload(protobuf: Uint8Array): Record<number, number> | undefined {
  let index = 0
  const fields: Record<number, number> = {}
  while (index < protobuf.length) {
    const key = readVarint(protobuf, index)
    if (key.value === undefined) {
      break
    }
    index = key.next
    const field = Number(key.value >> 3n)
    const wire = Number(key.value & 7n)
    if (wire === 0) {
      const value = readVarint(protobuf, index)
      index = value.next
      if (value.value !== undefined) {
        const parsed = toSafeNumber(value.value)
        if (parsed !== undefined) {
          fields[field] = parsed
        }
      }
      continue
    }
    if (wire === 5) {
      if (index + 4 > protobuf.length) {
        break
      }
      const view = new DataView(protobuf.buffer, protobuf.byteOffset + index, 4)
      const value = view.getFloat32(0, true)
      index += 4
      fields[field] = value
      continue
    }
    if (wire === 1) {
      if (index + 8 > protobuf.length) {
        break
      }
      const view = new DataView(protobuf.buffer, protobuf.byteOffset + index, 8)
      fields[field] = view.getFloat64(0, true)
      index += 8
      continue
    }
    if (wire === 2) {
      const len = readVarint(protobuf, index)
      if (len.value === undefined || len.value < 0) {
        break
      }
      const size = toSafeNumber(len.value)
      if (size === undefined || size < 0) {
        break
      }
      index = len.next + size
      if (index > protobuf.length) {
        break
      }
      continue
    }
    break
  }
  return Object.keys(fields).length ? fields : undefined
}

function parseSeiFieldsFromNal(nal: Uint8Array): Record<number, number> | undefined {
  if (!nal.length || (nal[0] & 0x1f) !== 6 || nal.length < 6) {
    return undefined
  }
  let markerStart = -1
  for (let i = 3; i < nal.length - 1; i++) {
    const current = nal[i]
    if (current === 0x42) {
      if (markerStart === -1) {
        markerStart = i
      }
      continue
    }
    if (current === 0x69 && markerStart !== -1) {
      const protobuf = removeRbspEscape(nal.slice(i + 1, nal.length - 1))
      return parseSeiPayload(protobuf)
    }
    markerStart = -1
  }
  return undefined
}

function parseFrameDurationsMs(data: DataView, mdia: Mp4Box, stbl: Mp4Box): number[] {
  const mdhd = findBox(data, mdia, 'mdhd')
  const stts = findBox(data, stbl, 'stts')
  if (!mdhd || !stts) {
    return []
  }
  const mdhdVersion = data.getUint8(mdhd.start)
  const timescale = mdhdVersion === 1
    ? data.getUint32(mdhd.start + 20)
    : data.getUint32(mdhd.start + 12)
  if (!timescale) {
    return []
  }
  const entryCount = data.getUint32(stts.start + 4)
  const durations: number[] = []
  let offset = stts.start + 8
  const sttsEnd = stts.start + stts.size
  for (let i = 0; i < entryCount && offset + 8 <= sttsEnd; i++) {
    const frameCount = data.getUint32(offset)
    const delta = data.getUint32(offset + 4)
    const ms = (delta / timescale) * 1000
    for (let j = 0; j < frameCount; j++) {
      durations.push(ms)
    }
    offset += 8
  }
  return durations
}

function findVideoTrack(data: DataView, moov: Mp4Box): {
  stbl: Mp4Box
  mdia: Mp4Box
  avcC: Mp4Box
} | undefined {
  const traks = parseMp4Boxes(data, moov.start, moov.start + moov.size).filter(item => item.type === 'trak')
  for (let i = 0; i < traks.length; i++) {
    const mdia = findBox(data, traks[i], 'mdia')
    const minf = mdia ? findBox(data, mdia, 'minf') : undefined
    const stbl = minf ? findBox(data, minf, 'stbl') : undefined
    const stsd = stbl ? findBox(data, stbl, 'stsd') : undefined
    if (!mdia || !stbl || !stsd) {
      continue
    }
    const sampleEntries = parseMp4Boxes(data, stsd.start + 8, stsd.start + stsd.size)
    const avc = sampleEntries.find(item => item.type === 'avc1' || item.type === 'avc3')
    // MP4 sample entry has a fixed header before child boxes.
    // For avc1/avc3, avcC is placed after 78 bytes in sample entry payload.
    const avcCSearchStart = avc ? avc.start + 78 : undefined
    const avcC = avc && avcCSearchStart !== undefined && avcCSearchStart < avc.start + avc.size
      ? parseMp4Boxes(data, avcCSearchStart, avc.start + avc.size).find(item => item.type === 'avcC')
      : undefined
    if (!avcC) {
      continue
    }
    return { stbl, mdia, avcC }
  }
  return undefined
}

const GEAR_MAP: Record<number, string> = {
  0: 'P',
  1: 'D',
  2: 'R',
  3: 'N',
}

const AUTOPILOT_MAP: Record<number, string> = {
  0: 'NONE',
  1: 'SELF_DRIVING',
  2: 'AUTOSTEER',
  3: 'TACC',
}

function readFieldNumber(fields: Record<number, number>, fieldNo: number, fallback?: number): number | undefined {
  const value = fields[fieldNo]
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }
  return value
}

function readFieldBool(fields: Record<number, number>, fieldNo: number, fallback = false): boolean {
  return Boolean(readFieldNumber(fields, fieldNo, fallback ? 1 : 0))
}

function addPointValue(values: Record<string, DashcamValue>, key: string, value: DashcamValue | undefined) {
  if (value === undefined) {
    return
  }
  values[key] = value
}

function buildPointFromFields(fields: Record<number, number>, timeMs: number): DashcamPoint {
  const speedMpsRaw = readFieldNumber(fields, 4, 0) ?? 0
  const speedMps = Math.abs(speedMpsRaw) < 1e-3 ? 0 : speedMpsRaw
  const speed = speedMps * 3.6
  const accelerator = readFieldNumber(fields, 5, 0) ?? 0
  const steering = readFieldNumber(fields, 6, 0) ?? 0
  const blinkerLeft = readFieldBool(fields, 7, false)
  const blinkerRight = readFieldBool(fields, 8, false)
  const brakeApplied = readFieldBool(fields, 9, false)
  const gearRaw = Math.round(readFieldNumber(fields, 2, 0) ?? 0)
  const autopilotRaw = Math.round(readFieldNumber(fields, 10, 0) ?? 0)
  const point: DashcamPoint = {
    t: Math.max(0, Math.round(timeMs)),
    metadataVersion: readFieldNumber(fields, 1),
    frameSeqNo: readFieldNumber(fields, 3),
    speedMps,
    speed,
    acceleratorPedal: accelerator,
    steeringAngle: steering,
    gear: GEAR_MAP[gearRaw] ?? String(gearRaw),
    autopilotState: AUTOPILOT_MAP[autopilotRaw] ?? String(autopilotRaw),
    blinkerLeft,
    blinkerRight,
    brakePressed: brakeApplied,
    turnSignal: deriveTurnSignal(blinkerLeft, blinkerRight),
  }

  const heading = readFieldNumber(fields, 13)
  if (heading !== undefined) {
    point.heading = heading
  }
  const lat = readFieldNumber(fields, 11)
  if (lat !== undefined) {
    point.latitude = lat
  }
  const lon = readFieldNumber(fields, 12)
  if (lon !== undefined) {
    point.longitude = lon
  }
  const accelX = readFieldNumber(fields, 14)
  if (accelX !== undefined) {
    point.accelX = accelX
  }
  const accelY = readFieldNumber(fields, 15)
  if (accelY !== undefined) {
    point.accelY = accelY
  }
  const accelZ = readFieldNumber(fields, 16)
  if (accelZ !== undefined) {
    point.accelZ = accelZ
  }

  const values: Record<string, DashcamValue> = {}
  Object.keys(fields)
    .map(key => Number(key))
    .sort((a, b) => a - b)
    .forEach((fieldNo) => {
      values[`f${fieldNo}`] = fields[fieldNo]
    })
  addPointValue(values, 'vehicle_speed_mps', Number(speedMps.toFixed(6)))
  addPointValue(values, 'vehicle_speed_kmh', Number(speed.toFixed(3)))
  addPointValue(values, 'accelerator_pedal_position', Number(accelerator.toFixed(3)))
  addPointValue(values, 'steering_wheel_angle', Number(steering.toFixed(3)))
  addPointValue(values, 'blinker_on_left', blinkerLeft)
  addPointValue(values, 'blinker_on_right', blinkerRight)
  addPointValue(values, 'brake_applied', brakeApplied)
  addPointValue(values, 'gear_state', gearRaw)
  addPointValue(values, 'autopilot_state', autopilotRaw)
  addPointValue(values, 'frame_seq_no', point.frameSeqNo)
  addPointValue(values, 'metadata_version', point.metadataVersion)
  if (point.latitude !== undefined) {
    addPointValue(values, 'latitude_deg', Number(point.latitude.toFixed(7)))
  }
  if (point.longitude !== undefined) {
    addPointValue(values, 'longitude_deg', Number(point.longitude.toFixed(7)))
  }
  if (point.heading !== undefined) {
    addPointValue(values, 'heading_deg', Number(point.heading.toFixed(4)))
  }
  if (point.accelX !== undefined) {
    addPointValue(values, 'linear_acceleration_mps2_x', Number(point.accelX.toFixed(6)))
  }
  if (point.accelY !== undefined) {
    addPointValue(values, 'linear_acceleration_mps2_y', Number(point.accelY.toFixed(6)))
  }
  if (point.accelZ !== undefined) {
    addPointValue(values, 'linear_acceleration_mps2_z', Number(point.accelZ.toFixed(6)))
  }
  if (Object.keys(values).length) {
    point.values = values
  }
  return point
}

export function parseDashcamFromMp4(fileBuffer: ArrayBuffer): DashcamPoint[] {
  const data = new DataView(fileBuffer)
  const moov = findTopBox(data, 'moov')
  const mdat = findTopBox(data, 'mdat')
  if (!moov || !mdat) {
    return []
  }
  const track = findVideoTrack(data, moov)
  if (!track) {
    return []
  }
  if (track.avcC.start + 5 > track.avcC.start + track.avcC.size) {
    return []
  }
  const nalLengthSize = (data.getUint8(track.avcC.start + 4) & 0x03) + 1
  const frameDurations = parseFrameDurationsMs(data, track.mdia, track.stbl)
  const averageFrameDuration = frameDurations.length
    ? frameDurations.reduce((total, item) => total + item, 0) / frameDurations.length
    : 1000 / 36

  const points: DashcamPoint[] = []
  let cursor = mdat.start
  const mdatEnd = mdat.start + mdat.size
  let pendingFields: Record<number, number> | undefined
  let frameIndex = 0
  let elapsedMs = 0

  while (cursor + nalLengthSize <= mdatEnd) {
    let nalSize = 0
    for (let i = 0; i < nalLengthSize; i++) {
      nalSize = (nalSize << 8) + data.getUint8(cursor + i)
    }
    cursor += nalLengthSize
    if (nalSize < 1 || cursor + nalSize > mdatEnd) {
      break
    }
    const nal = new Uint8Array(fileBuffer, cursor, nalSize)
    const nalType = nal[0] & 0x1f
    cursor += nalSize
    if (nalType === 6) {
      pendingFields = parseSeiFieldsFromNal(nal)
      continue
    }
    if (nalType === 1 || nalType === 5) {
      if (pendingFields) {
        points.push(buildPointFromFields(pendingFields, elapsedMs))
        pendingFields = undefined
      }
      elapsedMs += frameDurations[frameIndex] ?? averageFrameDuration
      frameIndex += 1
    }
  }
  return mergeDashcamPoints(points)
}

export function getClipPrefix(nameOrPath: string): string | undefined {
  const hit = nameOrPath.match(CLIP_PREFIX_REG)
  return hit?.[1]
}

export function isDashcamMetaFile(nameOrPath: string): boolean {
  if (nameOrPath.endsWith('event.json')) {
    return false
  }
  const hasPrefix = CLIP_PREFIX_REG.test(nameOrPath)
  const lower = nameOrPath.toLowerCase()
  const isSupported = lower.endsWith('.json') || lower.endsWith('.csv')
  return hasPrefix && isSupported
}

export function parseDashcamTelemetry(text: string, fileNameOrPath: string, clipStartMs: number): DashcamPoint[] {
  const lower = fileNameOrPath.toLowerCase()
  const points = lower.endsWith('.csv') ? parseCsv(text, clipStartMs) : parseJson(text, clipStartMs)
  return mergeDashcamPoints(points)
}

export function findDashcamPoint(points: DashcamPoint[] | undefined, currentSec: number): DashcamPoint | undefined {
  if (!points?.length) {
    return undefined
  }
  const currentMs = Math.floor(currentSec * 1000)
  let hit = points[0]
  for (let i = 0; i < points.length; i++) {
    if (points[i].t <= currentMs) {
      hit = points[i]
      continue
    }
    const prevDiff = Math.abs(currentMs - hit.t)
    const nextDiff = Math.abs(points[i].t - currentMs)
    if (nextDiff < prevDiff) {
      hit = points[i]
    }
    break
  }
  return hit
}

export function formatDashcamText(point: DashcamPoint | undefined): string {
  if (!point) {
    return ''
  }
  const chunks = [...formatBySpec(point), ...formatExtraValues(point)]
  return chunks.join(' | ')
}

// ── 与播放器 HUD 一致的精简遥测文本(用于导出烧录到视频底部) ──────────────
// 只保留 HUD 展示的字段:挡位/速度/方向盘/辅助驾驶/转向灯/刹车/电门,
// 不再像 formatDashcamText 那样把全部 extra values 一股脑写出来。

function hudToFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function hudToBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(lower)) return true
    if (['0', 'false', 'no', 'off', 'none'].includes(lower)) return false
  }
  return Boolean(value)
}

function hudGear(gear: DashcamPoint['gear']): string | undefined {
  if (gear === undefined || gear === null) return undefined
  const raw = String(gear).trim().toUpperCase()
  const mapped = Number(raw)
  if (Number.isFinite(mapped)) {
    return ({ 0: 'P', 1: 'D', 2: 'R', 3: 'N' } as Record<number, string>)[mapped] ?? raw
  }
  return raw || undefined
}

function hudAutopilot(state: DashcamPoint['autopilotState']): string | undefined {
  if (state === undefined || state === null || state === '') return undefined
  const raw = String(state).trim().toUpperCase()
  const labelMap: Record<string, string> = {
    NONE: '关闭', SELF_DRIVING: 'FSD', AUTOSTEER: 'Autosteer', TACC: 'TACC',
    '0': '关闭', '1': 'FSD', '2': 'Autosteer', '3': 'TACC',
  }
  return labelMap[raw] ?? String(state)
}

function hudSignal(point: DashcamPoint): string | undefined {
  const raw = String(point.turnSignal ?? '').trim().toLowerCase()
  let left = hudToBoolean(point.blinkerLeft)
  let right = hudToBoolean(point.blinkerRight)
  if (raw.includes('双') || raw.includes('hazard') || raw.includes('both') || raw === '3') { left = true; right = true }
  else if (raw.includes('左') || raw.includes('left') || raw === '1') { left = true; right = false }
  else if (raw.includes('右') || raw.includes('right') || raw === '2') { left = false; right = true }
  if (left && right) return '双闪'
  if (left) return '左'
  if (right) return '右'
  return undefined
}

function hudPercent(value: unknown): number | undefined {
  const num = hudToFiniteNumber(value)
  if (num === undefined) return undefined
  const scaled = num >= 0 && num <= 1 ? num * 100 : num
  return Math.min(100, Math.max(0, scaled))
}

export function formatDashcamHudText(point: DashcamPoint | undefined): string {
  if (!point) {
    return ''
  }
  const chunks: string[] = []

  const gear = hudGear(point.gear)
  if (gear) chunks.push(`挡位 ${gear}`)

  const speedKmh = hudToFiniteNumber(point.speed)
    ?? (hudToFiniteNumber(point.speedMps) === undefined ? undefined : (point.speedMps as number) * 3.6)
  if (speedKmh !== undefined) chunks.push(`速度 ${Math.max(0, Math.round(speedKmh))} km/h`)

  const steering = hudToFiniteNumber(point.steeringAngle)
  if (steering !== undefined) chunks.push(`方向盘 ${steering >= 0 ? '+' : ''}${steering.toFixed(1)}°`)

  const ap = hudAutopilot(point.autopilotState)
  if (ap) chunks.push(`辅助驾驶 ${ap}`)

  const signal = hudSignal(point)
  if (signal) chunks.push(`转向灯 ${signal}`)

  if (point.brakePressed !== undefined) {
    const brake = hudPercent(point.brakePressed) ?? (hudToBoolean(point.brakePressed) ? 100 : 0)
    chunks.push(`刹车 ${Math.round(brake)}%`)
  }

  const accel = hudPercent(point.acceleratorPedal)
  if (accel !== undefined) chunks.push(`电门 ${Math.round(accel)}%`)

  return chunks.join('  |  ')
}

export function formatDashcamDebugText(point: DashcamPoint | undefined): string {
  if (!point?.values) {
    return ''
  }
  return Object.keys(point.values)
    .sort((a, b) => a.localeCompare(b))
    .map(key => `${key}:${formatValue(point.values?.[key])}`)
    .join(' ')
}

// 遥测点是逐帧的(~36fps),若逐点生成字幕,速度/方向盘等值每帧微变会导致文本
// 不停跳动、底部黑底一直闪烁。这里按固定间隔(默认 1s,与顶部时间粒度一致)降采样,
// 每格取该时刻生效的点,且相邻字幕首尾相接、无空隙,从而像时间一样顺滑不闪。
export function buildDashcamSrt(points: DashcamPoint[] | undefined, intervalMs = 1000): string {
  if (!points?.length) {
    return ''
  }
  const lines: string[] = []
  let index = 1
  const lastT = points[points.length - 1].t
  let cursor = 0
  for (let start = 0; start <= lastT; start += intervalMs) {
    // 前进到「在 start 时刻生效」的最后一个点(t <= start)
    while (cursor + 1 < points.length && points[cursor + 1].t <= start) {
      cursor += 1
    }
    const text = formatDashcamHudText(points[cursor])
    if (!text) {
      continue
    }
    // end 直接等于下一格 start,首尾相接不留空隙(libass 区间为左闭右开,不会重叠)
    lines.push(String(index))
    lines.push(`${fmtTimestamp(start)} --> ${fmtTimestamp(start + intervalMs)}`)
    lines.push(text)
    lines.push('')
    index += 1
  }
  return lines.join('\n')
}

export function escapeFfmpegPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
}
