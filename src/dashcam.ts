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
  { key: 'speed', aliases: ['speed', 'speedkph', 'vehicle_speed', 'gps_speed', 'veh_speed'], label: '车速', unit: 'km/h', digits: 0 },
  { key: 'steeringAngle', aliases: ['steeringangle', 'steering_angle', 'steering', 'steer_angle'], label: '方向盘', unit: '°', digits: 1 },
  { key: 'gear', aliases: ['gear', 'selectedgear'], label: '档位' },
  { key: 'brakePressed', aliases: ['brake', 'brake_pressed', 'is_braking'], label: '刹车' },
  { key: 'acceleratorPedal', aliases: ['accelerator', 'accelerator_pedal', 'throttle', 'pedal'], label: '电门', unit: '%', digits: 1 },
  { key: 'turnSignal', aliases: ['turnsignal', 'turn_signal', 'signal'], label: '转向灯' },
  { key: 'heading', aliases: ['heading', 'yaw', 'course'], label: '航向', unit: '°', digits: 1 },
  { key: 'latitude', aliases: ['latitude', 'lat', 'gpslat'], label: '纬度', digits: 6 },
  { key: 'longitude', aliases: ['longitude', 'lon', 'lng', 'gpslon'], label: '经度', digits: 6 },
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
      case 'steeringAngle':
        point.steeringAngle = val as number
        break
      case 'gear':
        point.gear = val as string | number
        break
      case 'brakePressed':
        point.brakePressed = val as boolean | string | number
        break
      case 'acceleratorPedal':
        point.acceleratorPedal = val as number
        break
      case 'turnSignal':
        point.turnSignal = val as string | number
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
  const hasKnown = FIELD_SPECS.some(spec => point[spec.key] !== undefined)
  if (!hasKnown && !point.values) {
    return undefined
  }
  return point
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
    .sort((a, b) => a.localeCompare(b))
    .map(key => `${key} ${formatValue(values[key])}`)
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
  let hit: DashcamPoint | undefined
  for (let i = 0; i < points.length; i++) {
    if (points[i].t <= currentMs) {
      hit = points[i]
      continue
    }
    break
  }
  return hit ?? points[0]
}

export function formatDashcamText(point: DashcamPoint | undefined): string {
  if (!point) {
    return ''
  }
  const chunks = [...formatBySpec(point), ...formatExtraValues(point)]
  return chunks.join(' | ')
}

export function buildDashcamSrt(points: DashcamPoint[] | undefined): string {
  if (!points?.length) {
    return ''
  }
  const lines: string[] = []
  let index = 1
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const next = points[i + 1]
    const start = current.t
    const end = Math.max(start + 500, (next?.t ?? start + 1000) - 1)
    const text = formatDashcamText(current)
    if (!text) {
      continue
    }
    lines.push(String(index))
    lines.push(`${fmtTimestamp(start)} --> ${fmtTimestamp(end)}`)
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
