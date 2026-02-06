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

function readVarint(bytes: Uint8Array, start: number): { value?: number; next: number } {
  let value = 0
  let shift = 0
  let i = start
  while (i < bytes.length && shift < 35) {
    const current = bytes[i++]
    value |= (current & 0x7f) << shift
    if ((current & 0x80) === 0) {
      return { value, next: i }
    }
    shift += 7
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

function parseSeiPayload(payload: Uint8Array): {
  fields: Record<number, number>
} | undefined {
  const message = removeRbspEscape(payload)
  if (message.length < 12 || message[0] !== 0x42 || message[1] !== 0x42 || message[2] !== 0x42 || message[3] !== 0x69) {
    return undefined
  }
  const protobuf = message.slice(4)
  let index = 0
  const fields: Record<number, number> = {}
  while (index < protobuf.length) {
    const key = readVarint(protobuf, index)
    if (key.value === undefined) {
      break
    }
    index = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(protobuf, index)
      index = value.next
      if (value.value !== undefined) {
        fields[field] = value.value
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
      if (len.value === undefined) {
        break
      }
      index = len.next + len.value
      if (index > protobuf.length) {
        break
      }
      continue
    }
    break
  }
  return { fields }
}

function extractSeiPayloadFromSample(sample: Uint8Array, nalLengthSize: number): Uint8Array | undefined {
  let offset = 0
  while (offset + nalLengthSize <= sample.length) {
    let nalSize = 0
    for (let i = 0; i < nalLengthSize; i++) {
      nalSize = (nalSize << 8) + sample[offset + i]
    }
    offset += nalLengthSize
    if (nalSize <= 0 || offset + nalSize > sample.length) {
      break
    }
    const nal = sample.slice(offset, offset + nalSize)
    offset += nalSize
    if ((nal[0] & 0x1f) !== 6) {
      continue
    }
    let i = 1
    let payloadType = 0
    while (i < nal.length && nal[i] === 0xff) {
      payloadType += 255
      i += 1
    }
    if (i >= nal.length) {
      continue
    }
    payloadType += nal[i]
    i += 1
    let payloadSize = 0
    while (i < nal.length && nal[i] === 0xff) {
      payloadSize += 255
      i += 1
    }
    if (i >= nal.length) {
      continue
    }
    payloadSize += nal[i]
    i += 1
    if (payloadType !== 5 || i + payloadSize > nal.length) {
      continue
    }
    return nal.slice(i, i + payloadSize)
  }
  return undefined
}

export function parseDashcamFromMp4(fileBuffer: ArrayBuffer): DashcamPoint[] {
  const data = new DataView(fileBuffer)
  const top = parseMp4Boxes(data, 0, data.byteLength)
  const moov = top.find(item => item.type === 'moov')
  if (!moov) {
    return []
  }
  const trak = parseMp4Boxes(data, moov.start, moov.start + moov.size).find(item => item.type === 'trak')
  if (!trak) {
    return []
  }
  const mdia = findBox(data, trak, 'mdia')
  const minf = mdia ? findBox(data, mdia, 'minf') : undefined
  const stbl = minf ? findBox(data, minf, 'stbl') : undefined
  const stsd = stbl ? findBox(data, stbl, 'stsd') : undefined
  const stsc = stbl ? findBox(data, stbl, 'stsc') : undefined
  const stsz = stbl ? findBox(data, stbl, 'stsz') : undefined
  const stco = stbl ? findBox(data, stbl, 'stco') : undefined
  if (!stsd || !stsc || !stsz || !stco) {
    return []
  }

  const stsdStart = stsd.start
  const entryCount = data.getUint32(stsdStart + 4)
  if (entryCount < 1) {
    return []
  }
  const sampleEntryOffset = stsdStart + 8
  const avc1HeaderSize = 86
  if (sampleEntryOffset + avc1HeaderSize > stsdStart + stsd.size) {
    return []
  }
  const avcCOffset = sampleEntryOffset + avc1HeaderSize
  if (avcCOffset + 9 > stsdStart + stsd.size) {
    return []
  }
  // avcC box layout: [size(4)][type(4)][configurationVersion(1)][AVCProfileIndication(1)]
  // [profile_compatibility(1)][AVCLevelIndication(1)][lengthSizeMinusOne(1)]...
  const nalLengthSize = (data.getUint8(avcCOffset + 12) & 0x03) + 1

  const stscCount = data.getUint32(stsc.start + 4)
  const chunkRules: Array<{ firstChunk: number; samplesPerChunk: number }> = []
  for (let i = 0; i < stscCount; i++) {
    const base = stsc.start + 8 + i * 12
    chunkRules.push({
      firstChunk: data.getUint32(base),
      samplesPerChunk: data.getUint32(base + 4),
    })
  }
  const chunkCount = data.getUint32(stco.start + 4)
  const chunkOffsets: number[] = []
  for (let i = 0; i < chunkCount; i++) {
    chunkOffsets.push(data.getUint32(stco.start + 8 + i * 4))
  }
  const defaultSampleSize = data.getUint32(stsz.start + 4)
  const sampleCount = data.getUint32(stsz.start + 8)
  const sampleSizes: number[] = []
  for (let i = 0; i < sampleCount; i++) {
    sampleSizes.push(defaultSampleSize || data.getUint32(stsz.start + 12 + i * 4))
  }

  const sampleOffsets: number[] = []
  let sampleIndex = 0
  for (let chunkIndex = 1; chunkIndex <= chunkOffsets.length; chunkIndex++) {
    let rule = chunkRules[0]
    for (let i = 0; i < chunkRules.length; i++) {
      if (chunkRules[i].firstChunk <= chunkIndex) {
        rule = chunkRules[i]
      } else {
        break
      }
    }
    let offset = chunkOffsets[chunkIndex - 1]
    for (let i = 0; i < rule.samplesPerChunk && sampleIndex < sampleSizes.length; i++) {
      sampleOffsets.push(offset)
      offset += sampleSizes[sampleIndex]
      sampleIndex += 1
    }
  }

  const rows: Array<{
    frameIndex: number
    fields: Record<number, number>
  }> = []

  for (let i = 0; i < sampleOffsets.length; i++) {
    const sampleOffset = sampleOffsets[i]
    const sampleSize = sampleSizes[i]
    if (!sampleSize || sampleOffset + sampleSize > data.byteLength) {
      continue
    }
    const sample = new Uint8Array(fileBuffer, sampleOffset, sampleSize)
    const seiPayload = extractSeiPayloadFromSample(sample, nalLengthSize)
    if (!seiPayload) {
      continue
    }
    const parsed = parseSeiPayload(seiPayload)
    if (!parsed) {
      continue
    }
    rows.push({
      frameIndex: i,
      fields: parsed.fields,
    })
  }

  if (!rows.length) {
    return []
  }

  const validTicks = rows
    .map(item => item.fields[3])
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
  const firstTick = validTicks.length ? Math.min(...validTicks) : undefined
  const fps = 36

  const points = rows.map((item) => {
    const tick = item.fields[3]
    const t = firstTick !== undefined && tick !== undefined
      ? ((tick - firstTick) * 1000) / fps
      : (item.frameIndex * 1000) / fps
    const rawValues: Record<string, DashcamValue> = {}
    Object.keys(item.fields)
      .map(key => Number(key))
      .sort((a, b) => a - b)
      .forEach((fieldNo) => {
        rawValues[`f${fieldNo}`] = item.fields[fieldNo]
      })
    const speedMs = item.fields[5]
    const steering = item.fields[6]
    const headingRaw = item.fields[4]
    const accelX = item.fields[14]
    const accelY = item.fields[15]
    const point: DashcamPoint = {
      t: Math.max(0, Math.round(t)),
      values: Object.keys(rawValues).length ? rawValues : undefined,
    }
    if (speedMs !== undefined && speedMs > -1 && speedMs < 120) {
      point.speed = speedMs * 3.6
    }
    if (steering !== undefined && steering > -900 && steering < 900) {
      point.steeringAngle = steering
    }
    if (headingRaw !== undefined) {
      if (headingRaw >= 0 && headingRaw <= Math.PI * 2 + 0.2) {
        point.heading = (headingRaw * 180) / Math.PI
      } else if (headingRaw >= 0 && headingRaw <= 360) {
        point.heading = headingRaw
      }
    }
    if (accelX !== undefined && accelX > -20 && accelX < 20) {
      point.accelX = accelX
    }
    if (accelY !== undefined && accelY > -20 && accelY < 20) {
      point.accelY = accelY
    }
    return point
  })

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

export function formatDashcamDebugText(point: DashcamPoint | undefined): string {
  if (!point?.values) {
    return ''
  }
  return Object.keys(point.values)
    .sort((a, b) => a.localeCompare(b))
    .map(key => `${key}:${formatValue(point.values?.[key])}`)
    .join(' ')
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
