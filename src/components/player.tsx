import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  makeStyles,
  shorthands,
  tokens,
  Slider,
  Button,
} from '@fluentui/react-components'
import { Pause24Filled, Play24Filled } from '@fluentui/react-icons'
import MiniPlay from './mini-player'
import dayjs from 'dayjs'
import { useDelayPlay } from '../tool'
import { findDashcamPoint, formatDashcamDebugText } from '../dashcam'

import { type Video, type DashcamPoint, CameraEnum } from '../model'

const PLAYBACK_RATE_CYCLE = [1, 1.5, 2, 0.5]
const DURATION_LOAD_CONCURRENCY = 4
const EVENT_MARKER_VISUAL_HALF_WIDTH = 5
const HUD_WIDTH = '35%'
const HUD_MIN_WIDTH = '320px'
const HUD_MAX_WIDTH = '520px'
const HUD_BOTTOM = '56px'
const HUD_SIGNAL_INSET_PX = 8
const HUD_PEDAL_INSET_PX = 18

const useStyles = makeStyles({
  root: {
    ...shorthands.padding(0, '20px'),
  },
  videoWrap: {
    display: 'block',
    position: 'relative',
  },
  video: {
    width: '800px',
    height: '600px',
    backgroundColor: tokens.colorNeutralBackground5Selected,
    '@media screen and (min-width: 1440px)': {
      width: '1000px',
      height: '750px',
    },
    '@media screen and (min-width: 1680px)': {
      width: '1200px',
      height: '900px',
    },
  },
  time: {
    position: 'absolute',
    top: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    textAlign: 'center',
    minWidth: '280px',
    color: tokens.colorNeutralBackground1Hover,
    fontSize: '18px',
    fontWeight: 500,
    ...shorthands.padding('4px', '8px'),
    letterSpacing: '2px',
    backgroundColor: tokens.colorNeutralStencil1Alpha,
    ...shorthands.borderRadius('2px'),
  },
  dashcamHud: {
    position: 'absolute',
    left: '50%',
    bottom: HUD_BOTTOM,
    transform: 'translateX(-50%)',
    width: HUD_WIDTH,
    minWidth: HUD_MIN_WIDTH,
    maxWidth: HUD_MAX_WIDTH,
    color: tokens.colorNeutralBackground1Hover,
    ...shorthands.padding('8px', '12px'),
    backgroundColor: tokens.colorNeutralStencil1Alpha,
    ...shorthands.borderRadius('8px'),
    border: '1px solid rgba(255, 255, 255, 0.2)',
    zIndex: 3,
    pointerEvents: 'none',
  },
  dashTopRow: {
    display: 'grid',
    gridTemplateColumns: '58px 1fr 82px',
    alignItems: 'center',
    columnGap: '8px',
  },
  gearWrap: {
    justifySelf: 'start',
  },
  gearCircle: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.8)',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearLetter: {
    fontSize: '24px',
    lineHeight: '24px',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
  },
  apStateText: {
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  steeringWrap: {
    justifySelf: 'end',
    textAlign: 'center',
  },
  steeringWheel: {
    position: 'relative',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.95)',
    margin: '0 auto',
  },
  steeringNeedle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '2px',
    height: '13px',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
    transformOrigin: 'center 82%',
  },
  steeringText: {
    marginTop: '2px',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
  },
  dashMiddleRow: {
    display: 'grid',
    gridTemplateColumns: '64px 1fr 64px',
    alignItems: 'center',
    marginTop: '4px',
  },
  turnArrow: {
    textAlign: 'center',
    fontSize: '42px',
    lineHeight: '42px',
    fontWeight: 700,
    opacity: 0.25,
    transitionDuration: '120ms',
  },
  turnArrowLeft: {
    transform: `translateX(${HUD_SIGNAL_INSET_PX}px)`,
  },
  turnArrowRight: {
    transform: `translateX(-${HUD_SIGNAL_INSET_PX}px)`,
  },
  turnArrowActive: {
    opacity: 1,
    color: 'rgba(255, 214, 79, 0.98)',
  },
  dashSpeedWrap: {
    textAlign: 'center',
  },
  speedValue: {
    fontSize: '58px',
    lineHeight: '54px',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
  },
  speedUnit: {
    marginTop: '0',
    fontSize: '13px',
    lineHeight: '14px',
    letterSpacing: '1px',
    opacity: 0.95,
  },
  dashBottomRow: {
    display: 'grid',
    gridTemplateColumns: '54px 1fr 54px',
    alignItems: 'end',
    columnGap: '10px',
    marginTop: '4px',
  },
  pedalBox: {
    position: 'relative',
    height: '62px',
    ...shorthands.padding('6px', '4px'),
    ...shorthands.borderRadius('6px'),
    border: '1px solid rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    ...shorthands.overflow('hidden'),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    transitionDuration: '120ms',
  },
  pedalBoxLeft: {
    transform: `translateX(${HUD_PEDAL_INSET_PX}px)`,
  },
  pedalBoxRight: {
    transform: `translateX(-${HUD_PEDAL_INSET_PX}px)`,
  },
  pedalFill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '100%',
    height: 0,
    transitionDuration: '120ms',
    pointerEvents: 'none',
    zIndex: 1,
  },
  brakeFill: {
    backgroundColor: 'rgba(204, 56, 56, 0.95)',
  },
  accelFill: {
    backgroundColor: 'rgba(29, 160, 94, 0.95)',
  },
  pedalContent: {
    position: 'relative',
    zIndex: 2,
  },
  pedalLabel: {
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: 600,
  },
  pedalValue: {
    marginTop: '2px',
    fontSize: '14px',
    lineHeight: '16px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  dashMeta: {
    textAlign: 'center',
    fontSize: '11px',
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontVariantNumeric: 'tabular-nums',
    opacity: 0.95,
  },
  dashcamDebug: {
    marginTop: '2px',
    fontSize: '12px',
    opacity: 0.95,
    whiteSpace: 'normal',
    wordBreak: 'break-all',
    textAlign: 'center',
  },
  controlWrap: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('10px'),
    flexWrap: 'wrap',
  },
  slider: {
    width: '100%',
  },
  sliderWrap: {
    position: 'relative',
    flexGrow: 1,
    minWidth: '320px',
    overflow: 'hidden',
  },
  sliderTime: {
    minWidth: '62px',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  iconButton: {
    cursor: 'pointer',
    ':active': {
      color: tokens.colorNeutralForeground2,
    },
  },
  speedWrap: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('4px'),
  },
  speedButton: {
    minWidth: '50px',
  },
  seekButton: {
    minWidth: '58px',
  },
  eventMarker: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '2px',
    height: '18px',
    pointerEvents: 'none',
    backgroundColor: tokens.colorPaletteRedForeground1,
    zIndex: 2,
    '&::before': {
      content: '" "',
      position: 'absolute',
      width: '6px',
      height: '6px',
      top: '-4px',
      left: '50%',
      transform: 'translateX(-50%)',
      borderRadius: '50%',
      backgroundColor: tokens.colorPaletteRedForeground1,
    },
  },
  debugPanel: {
    marginTop: '8px',
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
    lineHeight: '16px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    ...shorthands.padding('6px', '8px'),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius('4px'),
  },
  empty: {},
  playFocusInput: {
    opacity: 0,
    position: 'fixed',
    top: '-100vh',
    left: '-100vw',
  },
})

interface PlayerProps {
  videos?: Video[]
  eventTime?: number
  showDashcamData?: boolean
  onVideoChange?: (video: Video) => void
}

function getCameraSrc(camera: CameraEnum, video: Video): string | undefined {
  switch (camera) {
    case CameraEnum.前:
      return video.src_f
    case CameraEnum.后:
      return video.src_b
    case CameraEnum.左:
      return video.src_l
    case CameraEnum.右:
      return video.src_r
  }
}

function getFirstAvailableSrc(video: Video): string | undefined {
  return video.src_f || video.src_b || video.src_l || video.src_r
}

function getSrc(camera: CameraEnum, video: Video): string {
  return getCameraSrc(camera, video) || getFirstAvailableSrc(video) || ''
}

function normalizeDuration(value?: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 0
  }
  return value
}

function fmtTime(time: number) {
  const totalSeconds = Math.max(0, Math.floor(time))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(lower)) {
      return true
    }
    if (['0', 'false', 'no', 'off', 'none'].includes(lower)) {
      return false
    }
  }
  return Boolean(value)
}

function formatGear(gear: DashcamPoint['gear']): string {
  if (gear === undefined || gear === null) {
    return '--'
  }
  const raw = String(gear).trim().toUpperCase()
  const mapped = Number(raw)
  if (Number.isFinite(mapped)) {
    return ({ 0: 'P', 1: 'D', 2: 'R', 3: 'N' } as Record<number, string>)[mapped] ?? raw
  }
  return raw || '--'
}

function formatAutopilot(state: DashcamPoint['autopilotState']): string {
  if (state === undefined || state === null || state === '') {
    return '辅助驾驶 --'
  }
  const raw = String(state).trim().toUpperCase()
  const labelMap: Record<string, string> = {
    NONE: '辅助驾驶 关闭',
    SELF_DRIVING: '辅助驾驶 FSD',
    AUTOSTEER: '辅助驾驶 Autosteer',
    TACC: '辅助驾驶 TACC',
    '0': '辅助驾驶 关闭',
    '1': '辅助驾驶 FSD',
    '2': '辅助驾驶 Autosteer',
    '3': '辅助驾驶 TACC',
  }
  return labelMap[raw] ?? `辅助驾驶 ${String(state)}`
}

function normalizeSignal(point?: DashcamPoint): { left: boolean; right: boolean } {
  const byFieldLeft = toBoolean(point?.blinkerLeft)
  const byFieldRight = toBoolean(point?.blinkerRight)
  const raw = String(point?.turnSignal ?? '').trim().toLowerCase()
  if (raw.includes('双') || raw.includes('hazard') || raw.includes('both')) {
    return { left: true, right: true }
  }
  if (raw === '3') {
    return { left: true, right: true }
  }
  if (raw.includes('左') || raw.includes('left') || raw === '1') {
    return { left: true, right: false }
  }
  if (raw.includes('右') || raw.includes('right') || raw === '2') {
    return { left: false, right: true }
  }
  return { left: byFieldLeft, right: byFieldRight }
}

function normalizeAcceleratorPercent(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined
  }
  const raw = value as number
  const scaled = raw >= 0 && raw <= 1 ? raw * 100 : raw
  return Math.min(100, Math.max(0, scaled))
}

function normalizeBrakePercent(value: DashcamPoint['brakePressed']): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const scaled = value >= 0 && value <= 1 ? value * 100 : value
    return Math.min(100, Math.max(0, scaled))
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const scaled = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed
      return Math.min(100, Math.max(0, scaled))
    }
  }
  return toBoolean(value) ? 100 : 0
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function formatFixed(value: number | undefined, digits = 1): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(digits)
}

function buildDashMeta(point?: DashcamPoint): string[] {
  if (!point) {
    return []
  }
  const chunks: string[] = []
  if (Number.isFinite(point.heading)) {
    chunks.push(`航向 ${formatFixed(point.heading, 0)}°`)
  }
  if (Number.isFinite(point.latitude) && Number.isFinite(point.longitude)) {
    chunks.push(`${formatFixed(point.latitude, 5)}, ${formatFixed(point.longitude, 5)}`)
  }
  if (Number.isFinite(point.powerKw)) {
    chunks.push(`功率 ${formatFixed(point.powerKw, 1)} kW`)
  }
  if (Number.isFinite(point.batteryLevel)) {
    chunks.push(`电量 ${formatFixed(point.batteryLevel, 1)}%`)
  }
  return chunks
}

function cls(...values: Array<string | false>): string {
  return values.filter(Boolean).join(' ')
}

function nextPlaybackRate(rate: number) {
  const index = PLAYBACK_RATE_CYCLE.findIndex(item => item === rate)
  if (index === -1) {
    return 1
  }
  return PLAYBACK_RATE_CYCLE[(index + 1) % PLAYBACK_RATE_CYCLE.length]
}

function buildInitialClipDurations(videos?: Video[]): number[] {
  if (!videos?.length) {
    return []
  }
  const durations = videos.map((_, index) => {
    if (index < videos.length - 1) {
      const diff = (videos[index + 1].time - videos[index].time) / 1000
      if (diff > 1 && diff < 300) {
        return diff
      }
    }
    return 60
  })
  if (durations.length > 1) {
    durations[durations.length - 1] = durations[durations.length - 2]
  }
  return durations
}

function locateClipByTimelineTime(timelineTime: number, clipDurations: number[]): { index: number; time: number } {
  if (!clipDurations.length) {
    return { index: 0, time: 0 }
  }
  let remains = Math.max(0, timelineTime)
  for (let index = 0; index < clipDurations.length; index++) {
    const duration = Math.max(normalizeDuration(clipDurations[index]), 0.1)
    if (remains < duration || index === clipDurations.length - 1) {
      return {
        index,
        time: Math.min(remains, Math.max(duration - 0.01, 0)),
      }
    }
    remains -= duration
  }
  return { index: clipDurations.length - 1, time: 0 }
}

async function loadClipDuration(src: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = src

    const timeout = window.setTimeout(() => finish(undefined), 3000)

    function cleanup() {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onError)
    }

    function finish(duration?: number) {
      cleanup()
      video.src = ''
      resolve(normalizeDuration(duration) || undefined)
    }

    function onLoadedMetadata() {
      finish(video.duration)
    }

    function onError() {
      finish(undefined)
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('error', onError)
    video.load()
  })
}

const Player: React.FC<React.PropsWithChildren<PlayerProps>> = (props) => {
  const styles = useStyles()
  const [currentCamera, setCurrentCamera] = useState(CameraEnum.前)
  const [currentClipIndex, setCurrentClipIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [currentTimelineTime, setCurrentTimelineTime] = useState(0)
  const [paused, setPaused] = useState(true)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [clipDurations, setClipDurations] = useState<number[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const sliderWrapRef = useRef<HTMLDivElement>(null)
  const eventMarkerRef = useRef<HTMLDivElement>(null)
  const inputIsFocus = useRef(false)
  const [sliderWrapWidth, setSliderWrapWidth] = useState(0)
  const [sliderRailLeft, setSliderRailLeft] = useState(0)
  const [sliderRailWidth, setSliderRailWidth] = useState(0)
  const [eventMarkerRectText, setEventMarkerRectText] = useState('n/a')
  const durationLoadTokenRef = useRef(0)
  const autoPlayAfterSwitchRef = useRef(false)
  const playIntentRef = useRef(false)
  const { delayPlay } = useDelayPlay()
  const videos = useMemo(() => (props.videos ?? []).filter(video => Boolean(getFirstAvailableSrc(video))), [props.videos])
  const currentVideo = videos[currentClipIndex]
  const showPlayerDebug = localStorage.getItem('playerDebug') === '1'
  const dashcamPoint = findDashcamPoint(currentVideo?.dashcam, currentTime)
  const showDashcamDebug = localStorage.getItem('dashcamDebug') === '1'
  const dashcamDebugText = showDashcamDebug ? formatDashcamDebugText(dashcamPoint) : ''
  const speedRaw = toFiniteNumber(dashcamPoint?.speed)
  const speedMps = toFiniteNumber(dashcamPoint?.speedMps)
  const speedKmh = speedRaw ?? (speedMps === undefined ? undefined : speedMps * 3.6)
  const speedText = Number.isFinite(speedKmh) ? String(Math.max(0, Math.round(speedKmh))) : '--'
  const steeringAngle = toFiniteNumber(dashcamPoint?.steeringAngle)
  const steeringRotate = Math.max(-540, Math.min(540, steeringAngle ?? 0))
  const steeringText = steeringAngle === undefined ? '--' : `${steeringAngle >= 0 ? '+' : ''}${steeringAngle.toFixed(1)}°`
  const signalState = normalizeSignal(dashcamPoint)
  const brakePercent = clampPercent(normalizeBrakePercent(dashcamPoint?.brakePressed))
  const acceleratorPercent = normalizeAcceleratorPercent(toFiniteNumber(dashcamPoint?.acceleratorPedal))
  const acceleratorValue = clampPercent(acceleratorPercent ?? 0)
  const acceleratorText = acceleratorPercent === undefined ? '--' : `${Math.round(acceleratorPercent)}%`
  const dashMeta = buildDashMeta(dashcamPoint)

  const clipStarts = useMemo(() => {
    let acc = 0
    return clipDurations.map((duration) => {
      const start = acc
      acc += normalizeDuration(duration)
      return start
    })
  }, [clipDurations])

  const totalDuration = useMemo(
    () => clipDurations.reduce((acc, duration) => acc + normalizeDuration(duration), 0),
    [clipDurations],
  )
  const currentClipDuration = normalizeDuration(clipDurations[currentClipIndex])
  const sliderMax = totalDuration > 0 ? totalDuration : 0.1
  const filenameNominalClipMs = useMemo(() => {
    if (videos.length < 2) {
      return 60000
    }
    const diffs = videos
      .slice(1)
      .map((video, index) => video.time - videos[index].time)
      .filter(diff => diff > 1000 && diff < 300000)
      .sort((a, b) => a - b)
    if (!diffs.length) {
      return 60000
    }
    return diffs[Math.floor(diffs.length / 2)]
  }, [videos])
  const filenameTimelineTotalMs = useMemo(() => {
    if (!videos.length) {
      return 0
    }
    if (videos.length === 1) {
      return filenameNominalClipMs
    }
    return Math.max(1, videos[videos.length - 1].time - videos[0].time + filenameNominalClipMs)
  }, [filenameNominalClipMs, videos])
  const eventTimelineByFilename = useMemo(() => {
    if (!props.eventTime || !videos.length || filenameTimelineTotalMs <= 0) {
      return undefined
    }
    const offsetMs = props.eventTime - videos[0].time
    const ratio = Math.max(0, Math.min(offsetMs / filenameTimelineTotalMs, 1))
    return {
      ratio,
      seconds: Math.max(0, offsetMs / 1000),
    }
  }, [filenameTimelineTotalMs, props.eventTime, videos])
  const eventTimelineTime = useMemo(() => {
    if (!eventTimelineByFilename) {
      return undefined
    }
    return eventTimelineByFilename.seconds
  }, [eventTimelineByFilename])
  const eventMarkerLeft = useMemo(() => {
    if (!eventTimelineByFilename || sliderWrapWidth <= 0) {
      return undefined
    }
    const ratio = eventTimelineByFilename.ratio
    const hasRail = sliderRailWidth > 0
    const horizontalPadding = 14
    const baseLeft = hasRail ? sliderRailLeft : horizontalPadding
    const usableWidth = hasRail ? sliderRailWidth : Math.max(sliderWrapWidth - horizontalPadding * 2, 1)
    const markerHalfWidth = EVENT_MARKER_VISUAL_HALF_WIDTH
    const center = baseLeft + usableWidth * ratio
    const safeCenter = Math.max(baseLeft + markerHalfWidth, Math.min(center, baseLeft + usableWidth - markerHalfWidth))
    return `${safeCenter}px`
  }, [eventTimelineByFilename, sliderRailLeft, sliderRailWidth, sliderWrapWidth])

  useEffect(() => {
    const wrap = sliderWrapRef.current
    if (!wrap) {
      return
    }
    const update = () => {
      setSliderWrapWidth(wrap.clientWidth || 0)
      const wrapRect = wrap.getBoundingClientRect()
      const rail = wrap.querySelector('.fui-Slider__rail') as HTMLElement | null
      if (!rail) {
        setSliderRailLeft(0)
        setSliderRailWidth(0)
        return
      }
      const railRect = rail.getBoundingClientRect()
      const left = Math.max(0, railRect.left - wrapRect.left)
      setSliderRailLeft(left)
      setSliderRailWidth(Math.max(0, railRect.width))
    }
    update()
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => update())
      observer.observe(wrap)
    }
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [videos.length])

  useEffect(() => {
    if (!showPlayerDebug) {
      return
    }
    const wrap = sliderWrapRef.current
    const rail = wrap?.querySelector('.fui-Slider__rail') as HTMLElement | null
    const marker = eventMarkerRef.current
    if (!wrap || !marker) {
      setEventMarkerRectText('n/a')
      return
    }
    const wrapRect = wrap.getBoundingClientRect()
    const railRect = rail?.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    const outside = markerRect.left < wrapRect.left || markerRect.right > wrapRect.right
    const railOutside = railRect ? markerRect.left < railRect.left || markerRect.right > railRect.right : false
    setEventMarkerRectText(
      `wrap=[${wrapRect.left.toFixed(1)},${wrapRect.right.toFixed(1)}], rail=${railRect ? `[${railRect.left.toFixed(1)},${railRect.right.toFixed(1)}]` : 'n/a'}, marker=[${markerRect.left.toFixed(1)},${markerRect.right.toFixed(1)}], outside=${outside}, railOutside=${railOutside}`,
    )
  }, [currentClipIndex, currentTime, eventMarkerLeft, showPlayerDebug, sliderWrapWidth, sliderRailLeft, sliderRailWidth])

  useEffect(() => {
    if (!showPlayerDebug) {
      return
    }
    // eslint-disable-next-line no-console
    console.log('[player-debug]', {
      currentClipIndex,
      videosLength: videos.length,
      currentTime,
      currentTimelineTime,
      sliderMax,
      totalDuration,
      eventTime: props.eventTime,
      eventTimelineTime,
      eventMarkerLeft,
      sliderWrapWidth,
      sliderRailLeft,
      sliderRailWidth,
      filenameNominalClipMs,
      filenameTimelineTotalMs,
      currentClipDuration: clipDurations[currentClipIndex],
      currentClipStart: clipStarts[currentClipIndex],
      currentSrc: currentVideo ? getSrc(currentCamera, currentVideo) : '',
    })
  }, [
    clipDurations,
    clipStarts,
    currentCamera,
    currentClipIndex,
    currentTime,
    currentTimelineTime,
    currentVideo,
    eventMarkerLeft,
    eventTimelineTime,
    filenameNominalClipMs,
    filenameTimelineTotalMs,
    props.eventTime,
    showPlayerDebug,
    sliderMax,
    sliderRailLeft,
    sliderRailWidth,
    sliderWrapWidth,
    totalDuration,
    videos.length,
  ])

  useEffect(() => {
    setCurrentClipIndex(0)
    setCurrentTime(0)
    setCurrentTimelineTime(0)
    setPaused(true)
    setPlaybackRate(1)
    setCurrentCamera(CameraEnum.前)
    setClipDurations(buildInitialClipDurations(videos))
    durationLoadTokenRef.current += 1
    autoPlayAfterSwitchRef.current = false
    playIntentRef.current = false

    if (!videoRef.current || !videos.length) {
      return
    }

    videoRef.current.pause()
    videoRef.current.src = getSrc(CameraEnum.前, videos[0])
    videoRef.current.currentTime = 0

    const currentToken = durationLoadTokenRef.current
    const workerCount = Math.min(DURATION_LOAD_CONCURRENCY, videos.length)
    let cursor = 0
    const worker = async () => {
      while (currentToken === durationLoadTokenRef.current) {
        const index = cursor
        cursor += 1
        if (index >= videos.length) {
          return
        }
        const duration = await loadClipDuration(getSrc(CameraEnum.前, videos[index]))
        const nextDuration = normalizeDuration(duration)
        if (!nextDuration || currentToken !== durationLoadTokenRef.current) {
          continue
        }
        setClipDurations((prev) => {
          if (!prev.length || index >= prev.length) {
            return prev
          }
          if (Math.abs(normalizeDuration(prev[index]) - nextDuration) < 0.01) {
            return prev
          }
          const next = [...prev]
          next[index] = nextDuration
          return next
        })
      }
    }
    for (let i = 0; i < workerCount; i++) {
      void worker()
    }
  }, [videos])

  useEffect(() => {
    setCurrentTimelineTime((clipStarts[currentClipIndex] ?? 0) + currentTime)
  }, [clipStarts, currentClipIndex, currentTime])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.playbackRate = playbackRate
  }, [playbackRate, currentClipIndex])

  function switchToClip(nextIndex: number, autoplay: boolean, startTime = 0) {
    if (!videoRef.current || !videos[nextIndex]) {
      return
    }
    const nextVideo = videos[nextIndex]
    const nextDuration = normalizeDuration(clipDurations[nextIndex]) || 0
    const safeTime = nextDuration
      ? Math.min(Math.max(startTime, 0), Math.max(nextDuration - 0.01, 0))
      : Math.max(startTime, 0)
    setCurrentClipIndex(nextIndex)
    setCurrentTime(safeTime)
    setCurrentTimelineTime((clipStarts[nextIndex] ?? 0) + safeTime)
    videoRef.current.pause()
    autoPlayAfterSwitchRef.current = autoplay
    videoRef.current.src = getSrc(currentCamera, nextVideo)
    videoRef.current.currentTime = safeTime
    videoRef.current.playbackRate = playbackRate
    if (!autoplay) {
      setPaused(true)
    }
    props.onVideoChange?.(nextVideo)
  }

  function onCanPlay() {
    if (!videoRef.current || !autoPlayAfterSwitchRef.current) {
      return
    }
    autoPlayAfterSwitchRef.current = false
    videoRef.current.playbackRate = playbackRate
    void videoRef.current.play().catch(() => {
      delayPlay(videoRef.current as HTMLVideoElement)
    })
    if (showPlayerDebug) {
      // eslint-disable-next-line no-console
      console.log('[player-debug] onCanPlay', { clipIndex: currentClipIndex, currentTime: videoRef.current.currentTime })
    }
  }

  function seekTimeline(nextTimelineTime: number) {
    if (!videoRef.current || !videos.length) return
    const clamped = Math.min(Math.max(nextTimelineTime, 0), sliderMax)
    const { index, time } = locateClipByTimelineTime(clamped, clipDurations)
    if (showPlayerDebug) {
      // eslint-disable-next-line no-console
      console.log('[player-debug] seekTimeline', { nextTimelineTime, clamped, index, time, currentClipIndex, sliderMax })
    }
    const autoplay = playIntentRef.current
    if (index === currentClipIndex) {
      videoRef.current.pause()
      videoRef.current.currentTime = time
      setCurrentTime(time)
      setCurrentTimelineTime(clamped)
      if (autoplay) {
        delayPlay(videoRef.current)
      }
      return
    }
    switchToClip(index, autoplay, time)
  }

  function seekOffset(deltaSeconds: number) {
    seekTimeline(currentTimelineTime + deltaSeconds)
  }

  function onKeyUp(e: Parameters<React.KeyboardEventHandler>[0]) {
    e.preventDefault()
    switch (e.code) {
      case 'Space':
        if (videoRef.current?.paused) {
          play()
        } else {
          pause()
        }
        break
      case 'ArrowLeft':
        seekOffset(-10)
        break
      case 'ArrowRight':
        seekOffset(10)
        break
      case 'KeyW':
        onSelectCamera(CameraEnum.前)
        break
      case 'KeyS':
        onSelectCamera(CameraEnum.后)
        break
      case 'KeyA':
        onSelectCamera(CameraEnum.左)
        break
      case 'KeyD':
        onSelectCamera(CameraEnum.右)
        break
      default:
      //
    }
  }

  function onSelectCamera(val: CameraEnum) {
    if (!videoRef.current || !currentVideo) return
    setCurrentCamera(val)
    const shouldResume = playIntentRef.current
    const time = videoRef.current.currentTime
    videoRef.current.pause()
    videoRef.current.src = getSrc(val, currentVideo)
    videoRef.current.currentTime = time
    videoRef.current.playbackRate = playbackRate
    if (shouldResume) {
      delayPlay(videoRef.current)
    }
  }

  function onTimeupdate() {
    if (!videoRef.current) return
    const duration = normalizeDuration(clipDurations[currentClipIndex]) || normalizeDuration(videoRef.current.duration)
    const time = videoRef.current.currentTime
    if (duration && time >= duration - 0.05) {
      const nextIndex = currentClipIndex + 1
      if (nextIndex < videos.length) {
        switchToClip(nextIndex, playIntentRef.current)
        return
      }
      const timelineEnd = (clipStarts[currentClipIndex] ?? 0) + duration
      setCurrentTime(duration)
      setCurrentTimelineTime(timelineEnd)
      playIntentRef.current = false
      videoRef.current.pause()
      return
    }
    setCurrentTime(time)
    setCurrentTimelineTime((clipStarts[currentClipIndex] ?? 0) + time)
  }

  function play() {
    if (!videoRef.current) return
    playIntentRef.current = true
    videoRef.current.playbackRate = playbackRate
    void videoRef.current.play()
    setPaused(false)
  }

  function pause() {
    if (!videoRef.current) return
    playIntentRef.current = false
    videoRef.current.pause()
    setPaused(true)
  }

  function onLoadedMetadata() {
    if (!videoRef.current) return
    videoRef.current.playbackRate = playbackRate
    const loadedDuration = normalizeDuration(videoRef.current.duration)
    if (!loadedDuration) {
      return
    }
    setClipDurations((prev) => {
      if (!prev.length || currentClipIndex >= prev.length) {
        return prev
      }
      if (Math.abs(normalizeDuration(prev[currentClipIndex]) - loadedDuration) < 0.01) {
        return prev
      }
      const next = [...prev]
      next[currentClipIndex] = loadedDuration
      return next
    })
  }

  function onVideoError() {
    if (!videos.length) {
      return
    }
    const nextIndex = currentClipIndex + 1
    if (showPlayerDebug) {
      // eslint-disable-next-line no-console
      console.log('[player-debug] onVideoError', { currentClipIndex, nextIndex, videosLength: videos.length })
    }
    if (nextIndex < videos.length) {
      switchToClip(nextIndex, playIntentRef.current)
      return
    }
    playIntentRef.current = false
    setPaused(true)
  }

  function onPlayFocus() {
    inputIsFocus.current = true
  }

  function onPlayBlur() {
    inputIsFocus.current = false
  }

  return (
    <div className={styles.root}>
      {
        currentVideo ? (
          <div className={styles.root}>
            <label className={styles.videoWrap} htmlFor="player-focus-input">
              <video
                muted
                className={styles.video}
                id="player"
                ref={videoRef}
                onCanPlay={onCanPlay}
                onError={onVideoError}
                onLoadedMetadata={onLoadedMetadata}
                onPause={() => setPaused(true)}
                onPlay={() => setPaused(false)}
                onTimeUpdate={onTimeupdate}
              />
              {
                [CameraEnum.前, CameraEnum.后, CameraEnum.左, CameraEnum.右].map(camera => (
                  <MiniPlay
                    camera={camera}
                    currentTime={currentTime}
                    isActive={currentCamera === camera}
                    key={camera}
                    paused={paused}
                    playbackRate={playbackRate}
                    src={getSrc(camera, currentVideo)}
                    onClick={() => onSelectCamera(camera)}
                  />
                ))
              }
              <div className={styles.time}>
                {dayjs(currentVideo.time + currentTime * 1000).format('YYYY-MM-DD HH:mm:ss')}
              </div>
              {props.showDashcamData !== false && dashcamPoint ? (
                <div className={styles.dashcamHud}>
                  <div className={styles.dashTopRow}>
                    <div className={styles.gearWrap}>
                      <div className={styles.gearCircle}>
                        <span className={styles.gearLetter}>{formatGear(dashcamPoint.gear)}</span>
                      </div>
                    </div>
                    <div className={styles.apStateText}>{formatAutopilot(dashcamPoint.autopilotState)}</div>
                    <div className={styles.steeringWrap}>
                      <div className={styles.steeringWheel}>
                        <div
                          className={styles.steeringNeedle}
                          style={{ transform: `translate(-50%, -50%) rotate(${steeringRotate}deg)` }}
                        />
                      </div>
                      <div className={styles.steeringText}>{steeringText}</div>
                    </div>
                  </div>
                  <div className={styles.dashMiddleRow}>
                    <div className={cls(styles.turnArrow, styles.turnArrowLeft, signalState.left && styles.turnArrowActive)}>←</div>
                    <div className={styles.dashSpeedWrap}>
                      <div className={styles.speedValue}>{speedText}</div>
                      <div className={styles.speedUnit}>KM/H</div>
                    </div>
                    <div className={cls(styles.turnArrow, styles.turnArrowRight, signalState.right && styles.turnArrowActive)}>→</div>
                  </div>
                  <div className={styles.dashBottomRow}>
                    <div className={cls(styles.pedalBox, styles.pedalBoxLeft)}>
                      <div className={cls(styles.pedalFill, styles.brakeFill)} style={{ height: `${brakePercent}%` }} />
                      <div className={styles.pedalContent}>
                        <div className={styles.pedalLabel}>刹车</div>
                        <div className={styles.pedalValue}>{Math.round(brakePercent)}%</div>
                      </div>
                    </div>
                    <div className={styles.dashMeta}>
                      {dashMeta.length ? dashMeta.join(' | ') : ' '}
                      {dashcamDebugText ? <div className={styles.dashcamDebug}>{dashcamDebugText}</div> : null}
                    </div>
                    <div className={cls(styles.pedalBox, styles.pedalBoxRight)}>
                      <div className={cls(styles.pedalFill, styles.accelFill)} style={{ height: `${acceleratorValue}%` }} />
                      <div className={styles.pedalContent}>
                        <div className={styles.pedalLabel}>电门</div>
                        <div className={styles.pedalValue}>{acceleratorText}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </label>
            <div className={styles.controlWrap}>
              {
                paused
                  ? <Play24Filled
                      className={styles.iconButton}
                      onClick={play}
                    />
                  : <Pause24Filled
                      className={styles.iconButton}
                      onClick={pause}
                    />
              }
              <Button className={styles.seekButton} size="small" onClick={() => seekOffset(-10)}>-10s</Button>
              <Button className={styles.seekButton} size="small" onClick={() => seekOffset(10)}>+10s</Button>
              <div className={styles.speedWrap}>
                <Button
                  appearance="subtle"
                  className={styles.speedButton}
                  size="small"
                  onClick={() => setPlaybackRate(rate => nextPlaybackRate(rate))}
                >
                  {playbackRate}x
                </Button>
              </div>
              <div className={styles.sliderTime}>{fmtTime(currentTimelineTime)}</div>
              <div className={styles.sliderWrap} ref={sliderWrapRef}>
                <Slider
                  className={styles.slider}
                  max={sliderMax}
                  min={0}
                  value={Math.min(currentTimelineTime, sliderMax)}
                  onChange={(_, data) => seekTimeline(Number(data.value))}
                />
                {eventMarkerLeft ? <div className={styles.eventMarker} ref={eventMarkerRef} style={{ left: eventMarkerLeft }} /> : null}
              </div>
              <div className={styles.sliderTime}>{fmtTime(totalDuration || currentClipDuration)}</div>
            </div>
            {showPlayerDebug ? (
              <div className={styles.debugPanel}>
                {`debug
clip=${currentClipIndex + 1}/${videos.length}
currentTime=${currentTime.toFixed(3)}s timeline=${currentTimelineTime.toFixed(3)}s max=${sliderMax.toFixed(3)}s
eventTime=${props.eventTime ?? '-'} eventTimeline=${eventTimelineTime?.toFixed(3) ?? '-'} markerLeft=${eventMarkerLeft ?? '-'}
sliderWrapWidth=${sliderWrapWidth}px
sliderRailLeft=${sliderRailLeft.toFixed(2)}px sliderRailWidth=${sliderRailWidth.toFixed(2)}px
filenameNominalClipMs=${filenameNominalClipMs} filenameTimelineTotalMs=${filenameTimelineTotalMs}
clipStart=${(clipStarts[currentClipIndex] ?? 0).toFixed(3)}s clipDuration=${(clipDurations[currentClipIndex] ?? 0).toFixed(3)}s
${eventMarkerRectText}`}
              </div>
            ) : null}
            <input
              autoFocus
              className={styles.playFocusInput}
              id="player-focus-input"
              onBlur={onPlayBlur}
              onFocus={onPlayFocus}
              onKeyUp={onKeyUp}
            />
          </div>
        ) : (
          <div className={styles.empty}>
            暂无数据
          </div>
        )
      }

    </div>
  )
}

Player.defaultProps = {}

export default Player
