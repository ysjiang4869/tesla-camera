import React, { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import MiniPlay from './mini-player'
import { Icons } from './icons'
import { useDelayPlay } from '../tool'
import { findDashcamPoint, formatDashcamDebugText } from '../dashcam'
import { type Video, type VideoGroup, type DashcamPoint, CameraEnum } from '../model'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAYBACK_RATE_CYCLE = [1, 1.5, 2, 0.5]
const DURATION_LOAD_CONCURRENCY = 4

const CAMERAS = [
  { enum: CameraEnum.前, short: 'FRONT' },
  { enum: CameraEnum.后, short: 'REAR' },
  { enum: CameraEnum.左, short: 'LEFT' },
  { enum: CameraEnum.右, short: 'RIGHT' },
] as const

const STEERING_WHEEL_ICON = new URL('../assets/steering_wheel.png', import.meta.url).href

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'var(--bg-0)',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--fg-3)',
    fontSize: 14,
  },

  // Toolbar
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 18px 0',
    flexShrink: 0,
  },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '1.4px',
    textTransform: 'uppercase' as const,
    color: 'var(--fg-2)',
  },
  layoutSeg: {
    display: 'inline-flex',
    padding: 3,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    gap: 2,
  },
  layoutBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--fg-1)',
    padding: '5px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.4px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all .15s',
  },
  layoutBtnActive: {
    background: 'var(--bg-2)',
    color: 'var(--fg-0)',
    boxShadow: '0 0 0 1px var(--line-strong) inset, 0 1px 0 oklch(1 0 0 / 0.04) inset',
  },
  toolbarMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    fontSize: 11,
    color: 'var(--fg-2)',
    fontWeight: 500,
  },
  toolbarMetaItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },

  // Stage
  stage: {
    flex: 1,
    minHeight: 0,
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  focusGrid: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '1fr 200px',
    gap: 14,
  },

  // Primary video area
  primary: {
    position: 'relative' as const,
    background: 'linear-gradient(180deg, oklch(0.18 0.005 250), oklch(0.14 0.006 250))',
    borderRadius: 14,
    overflow: 'hidden' as const,
    border: '1px solid var(--line)',
    boxShadow: 'var(--shadow-2)',
    minHeight: 0,
  },
  primaryHidden: {
    position: 'absolute' as const,
    left: '-9999px',
    width: 1,
    height: 1,
    overflow: 'hidden' as const,
  },
  videoFill: {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    display: 'block',
  },
  scrim: {
    position: 'absolute' as const, inset: 0,
    background: 'radial-gradient(ellipse at top, oklch(0 0 0 / 0.3), transparent 55%), linear-gradient(180deg, transparent 60%, oklch(0 0 0 / 0.3))',
    pointerEvents: 'none' as const,
  },
  topRow: {
    position: 'absolute' as const,
    top: 14, left: 14, right: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    pointerEvents: 'none' as const,
  },
  recPill: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 10px 5px 8px',
    background: 'oklch(0 0 0 / 0.55)',
    backdropFilter: 'blur(10px)',
    border: '1px solid oklch(1 0 0 / 0.08)',
    borderRadius: 99,
    fontSize: 11,
    color: 'var(--fg-0)',
    letterSpacing: '0.4px',
    fontWeight: 500,
    pointerEvents: 'auto' as const,
  },
  recDot: {
    width: 7, height: 7, borderRadius: 99,
    background: 'var(--danger)',
    boxShadow: '0 0 0 3px oklch(0.68 0.21 25 / 0.25)',
    animation: 'pulse 1.6s ease-in-out infinite',
    flexShrink: 0,
  },
  timestamp: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    color: 'var(--fg-0)',
    padding: '5px 12px',
    background: 'oklch(0 0 0 / 0.55)',
    backdropFilter: 'blur(10px)',
    border: '1px solid oklch(1 0 0 / 0.08)',
    borderRadius: 8,
    letterSpacing: '0.5px',
    fontVariantNumeric: 'tabular-nums' as const,
    pointerEvents: 'auto' as const,
  },
  geoPill: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 10px',
    background: 'oklch(0 0 0 / 0.55)',
    backdropFilter: 'blur(10px)',
    border: '1px solid oklch(1 0 0 / 0.08)',
    borderRadius: 8,
    fontSize: 11,
    color: 'var(--fg-1)',
    fontFamily: "'JetBrains Mono', monospace",
    pointerEvents: 'auto' as const,
  },
  camLabel: {
    position: 'absolute' as const,
    bottom: 14, left: 14,
    padding: '3px 10px',
    background: 'oklch(0 0 0 / 0.55)',
    backdropFilter: 'blur(10px)',
    border: '1px solid oklch(1 0 0 / 0.08)',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    color: 'var(--fg-0)',
  },

  // Camera tile column
  camTileCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    minHeight: 0,
  },
  camTile: {
    position: 'relative' as const,
    flex: '1 1 0',
    minHeight: 0,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    overflow: 'hidden' as const,
    cursor: 'pointer',
    transition: 'border-color 120ms',
  },
  camTileActive: {
    borderColor: 'oklch(0.78 0.13 220 / 0.6)',
    boxShadow: '0 0 0 1px oklch(0.78 0.13 220 / 0.4)',
  },
  camTag: {
    position: 'absolute' as const,
    top: 7, left: 7,
    padding: '2px 6px',
    background: 'oklch(0 0 0 / 0.6)',
    backdropFilter: 'blur(8px)',
    border: '1px solid oklch(1 0 0 / 0.06)',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--fg-0)',
    pointerEvents: 'none' as const,
  },
  camActiveDot: {
    position: 'absolute' as const,
    top: 7, right: 7,
    width: 6, height: 6, borderRadius: 99,
    background: 'var(--accent)',
    boxShadow: '0 0 0 3px oklch(0.78 0.13 220 / 0.25)',
    pointerEvents: 'none' as const,
  },
  activePlaceholder: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, oklch(0.20 0.007 250), oklch(0.17 0.006 250))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Split mode
  splitContainer: {
    flex: 1,
    minHeight: 0,
    position: 'relative' as const,
    background: 'linear-gradient(180deg, oklch(0.18 0.005 250), oklch(0.14 0.006 250))',
    borderRadius: 14,
    overflow: 'hidden' as const,
    border: '1px solid var(--line)',
    boxShadow: 'var(--shadow-2)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  splitTopBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    background: 'linear-gradient(180deg, oklch(0.16 0.005 250 / 0.96), oklch(0.13 0.006 250 / 0.92))',
    borderBottom: '1px solid var(--line)',
    zIndex: 3,
    flexShrink: 0,
  },
  splitGrid: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: 2,
    background: 'var(--line-strong)',
  },
  splitCell: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    background: 'var(--bg-2)',
    cursor: 'pointer',
  },
  splitCellScrim: {
    position: 'absolute' as const, inset: 0,
    background: 'linear-gradient(180deg, oklch(0 0 0 / 0.25) 0%, transparent 25%, transparent 75%, oklch(0 0 0 / 0.2) 100%)',
    pointerEvents: 'none' as const,
    zIndex: 1,
  },
  splitCellLabel: {
    position: 'absolute' as const,
    top: 10, left: 10,
    padding: '3px 7px',
    background: 'oklch(0 0 0 / 0.6)',
    backdropFilter: 'blur(8px)',
    border: '1px solid oklch(1 0 0 / 0.06)',
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    color: 'var(--fg-0)',
    zIndex: 2,
    pointerEvents: 'none' as const,
  },

  // HUD
  hud: {
    position: 'absolute' as const,
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(480px, 68%)',
    background: 'oklch(0.16 0.005 250 / 0.65)',
    backdropFilter: 'blur(18px) saturate(160%)',
    border: '1px solid oklch(1 0 0 / 0.08)',
    borderRadius: 16,
    padding: '12px 14px',
    color: 'var(--fg-0)',
    boxShadow: '0 12px 40px -12px oklch(0 0 0 / 0.7)',
    pointerEvents: 'none' as const,
    zIndex: 4,
  },
  hudTopRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  gearBadge: {
    width: 36, height: 36,
    borderRadius: 9,
    border: '1px solid oklch(1 0 0 / 0.18)',
    display: 'grid', placeItems: 'center' as const,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: 17,
    color: 'var(--fg-0)',
    background: 'oklch(1 0 0 / 0.04)',
  },
  apWrap: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2 },
  apLabel: {
    fontSize: 9,
    color: 'var(--fg-2)',
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  },
  apState: { fontSize: 12, fontWeight: 600, color: 'oklch(0.85 0.10 220)', letterSpacing: '0.3px' },
  steeringWrap: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2 },
  steeringText: {
    fontSize: 9.5,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--fg-1)',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  speedRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 10,
    margin: '2px 0 10px',
  },
  turnArrow: {
    display: 'grid', placeItems: 'center' as const,
    color: 'oklch(0.45 0.03 250)',
    transition: 'color 120ms',
  },
  turnActive: { color: 'oklch(0.85 0.16 80)' },
  speedBlock: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  speedValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-2px',
    fontVariantNumeric: 'tabular-nums' as const,
    color: 'var(--fg-0)',
  },
  speedUnit: {
    fontSize: 10,
    color: 'var(--fg-2)',
    letterSpacing: '2px',
    marginTop: 3,
    fontWeight: 600,
  },
  pedalRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  pedal: {
    position: 'relative' as const,
    height: 34,
    borderRadius: 7,
    background: 'oklch(1 0 0 / 0.05)',
    border: '1px solid oklch(1 0 0 / 0.10)',
    overflow: 'hidden' as const,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    justifyContent: 'space-between',
  },
  pedalFill: {
    position: 'absolute' as const, inset: 0,
    width: '0%',
    transition: 'width 200ms',
    pointerEvents: 'none' as const,
  },
  pedalLabel: {
    position: 'relative' as const,
    fontSize: 9.5,
    color: 'var(--fg-2)',
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    zIndex: 1,
  },
  pedalValue: {
    position: 'relative' as const,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12.5,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums' as const,
    zIndex: 1,
  },

  // Timeline
  timelineWrap: {
    padding: '0 18px 16px',
    flexShrink: 0,
  },
  timeline: {
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  timelineTopRow: { display: 'flex', alignItems: 'center', gap: 12 },
  transport: { display: 'flex', alignItems: 'center', gap: 2 },
  tBtn: {
    width: 32, height: 32,
    border: 0,
    background: 'transparent',
    color: 'var(--fg-1)',
    borderRadius: 8,
    display: 'grid', placeItems: 'center' as const,
    cursor: 'pointer',
    transition: 'background 120ms, color 120ms',
  },
  playBtn: {
    width: 36, height: 36,
    background: 'var(--fg-0)',
    color: 'var(--bg-0)',
    borderRadius: 99,
    border: 0,
    display: 'grid', placeItems: 'center' as const,
    cursor: 'pointer',
    margin: '0 2px',
    flexShrink: 0,
  },
  rateBtn: {
    height: 26,
    padding: '0 9px',
    border: '1px solid var(--line)',
    background: 'var(--bg-2)',
    color: 'var(--fg-0)',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: 'pointer',
    flexShrink: 0,
  },
  timeText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12.5,
    fontVariantNumeric: 'tabular-nums' as const,
    color: 'var(--fg-0)',
    minWidth: 50,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  timeTextMuted: { color: 'var(--fg-2)' },
  scrubWrap: {
    flex: 1,
    position: 'relative' as const,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    minWidth: 0,
  },
  scrubTrack: {
    position: 'absolute' as const,
    left: 0, right: 0,
    height: 5,
    borderRadius: 99,
    background: 'var(--bg-3)',
    overflow: 'hidden' as const,
  },
  scrubProgress: {
    position: 'absolute' as const,
    left: 0, top: 0, bottom: 0,
    background: 'linear-gradient(90deg, oklch(0.78 0.13 220), oklch(0.72 0.14 220))',
    borderRadius: 99,
    transition: 'width 80ms linear',
  },
  scrubSegments: {
    position: 'absolute' as const, left: 0, right: 0, top: -2, height: 10,
    pointerEvents: 'none' as const,
  },
  segMark: {
    position: 'absolute' as const, top: 0, bottom: 0, width: 1,
    background: 'oklch(0 0 0 / 0.5)',
  },
  scrubThumb: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 13, height: 13,
    borderRadius: 99,
    background: 'var(--fg-0)',
    border: '2px solid oklch(0.78 0.13 220)',
    boxShadow: '0 2px 8px oklch(0 0 0 / 0.5)',
    transition: 'left 80ms linear',
    pointerEvents: 'none' as const,
  },
  eventMark: {
    position: 'absolute' as const,
    top: -7,
    transform: 'translateX(-50%)',
    width: 2,
    height: 20,
    background: 'var(--danger)',
    borderRadius: 99,
    pointerEvents: 'none' as const,
  },
  eventMarkDot: {
    position: 'absolute' as const,
    top: -8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 7, height: 7,
    background: 'var(--danger)',
    borderRadius: 99,
    boxShadow: '0 0 0 3px oklch(0.68 0.21 25 / 0.25)',
  },
  timelineMeta: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 10.5,
    color: 'var(--fg-2)',
    fontFamily: "'JetBrains Mono', monospace",
    fontVariantNumeric: 'tabular-nums' as const,
  },
  metaChips: { display: 'flex', alignItems: 'center', gap: 12 },
  metaChip: { display: 'flex', alignItems: 'center', gap: 4 },
  metaChipDot: { width: 5, height: 5, borderRadius: 99 },

  // Debug
  debugPanel: {
    margin: '0 18px',
    color: 'var(--fg-3)',
    fontSize: 11,
    lineHeight: '16px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    padding: '6px 8px',
    background: 'var(--bg-2)',
    borderRadius: 4,
  },

  // Focus input (hidden, for keyboard shortcuts)
  focusInput: {
    opacity: 0,
    position: 'fixed' as const,
    top: '-100vh',
    left: '-100vw',
  },
}

// ─── Helper functions (same as before) ────────────────────────────────────────

function normalizeDuration(value?: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) return 0
  return value
}

function fmtTime(time: number) {
  const totalSeconds = Math.max(0, Math.floor(time))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(lower)) return true
    if (['0', 'false', 'no', 'off', 'none'].includes(lower)) return false
  }
  return Boolean(value)
}

function formatGear(gear: DashcamPoint['gear']): string {
  if (gear === undefined || gear === null) return '--'
  const raw = String(gear).trim().toUpperCase()
  const mapped = Number(raw)
  if (Number.isFinite(mapped)) {
    return ({ 0: 'P', 1: 'D', 2: 'R', 3: 'N' } as Record<number, string>)[mapped] ?? raw
  }
  return raw || '--'
}

function formatAutopilot(state: DashcamPoint['autopilotState']): string {
  if (state === undefined || state === null || state === '') return '辅助驾驶 --'
  const raw = String(state).trim().toUpperCase()
  const labelMap: Record<string, string> = {
    NONE: '辅助驾驶 关闭', SELF_DRIVING: 'FSD · Engaged', AUTOSTEER: 'Autosteer', TACC: 'TACC',
    '0': '辅助驾驶 关闭', '1': 'FSD · Engaged', '2': 'Autosteer', '3': 'TACC',
  }
  return labelMap[raw] ?? `AP ${String(state)}`
}

function normalizeSignal(point?: DashcamPoint): { left: boolean; right: boolean } {
  const byFieldLeft = toBoolean(point?.blinkerLeft)
  const byFieldRight = toBoolean(point?.blinkerRight)
  const raw = String(point?.turnSignal ?? '').trim().toLowerCase()
  if (raw.includes('双') || raw.includes('hazard') || raw.includes('both') || raw === '3') return { left: true, right: true }
  if (raw.includes('左') || raw.includes('left') || raw === '1') return { left: true, right: false }
  if (raw.includes('右') || raw.includes('right') || raw === '2') return { left: false, right: true }
  return { left: byFieldLeft, right: byFieldRight }
}

function normalizeAcceleratorPercent(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined
  const scaled = (value as number) >= 0 && (value as number) <= 1 ? (value as number) * 100 : (value as number)
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

function clampPercent(value: number): number { return Math.min(100, Math.max(0, value)) }

function nextPlaybackRate(rate: number) {
  const index = PLAYBACK_RATE_CYCLE.findIndex(item => item === rate)
  if (index === -1) return 1
  return PLAYBACK_RATE_CYCLE[(index + 1) % PLAYBACK_RATE_CYCLE.length]
}

function buildInitialClipDurations(videos?: Video[]): number[] {
  if (!videos?.length) return []
  const durations = videos.map((_, index) => {
    if (index < videos.length - 1) {
      const diff = (videos[index + 1].time - videos[index].time) / 1000
      if (diff > 1 && diff < 300) return diff
    }
    return 60
  })
  if (durations.length > 1) durations[durations.length - 1] = durations[durations.length - 2]
  return durations
}

function locateClipByTimelineTime(timelineTime: number, clipDurations: number[]): { index: number; time: number } {
  if (!clipDurations.length) return { index: 0, time: 0 }
  let remains = Math.max(0, timelineTime)
  for (let index = 0; index < clipDurations.length; index++) {
    const duration = Math.max(normalizeDuration(clipDurations[index]), 0.1)
    if (remains < duration || index === clipDurations.length - 1) {
      return { index, time: Math.min(remains, Math.max(duration - 0.01, 0)) }
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
    function finish(duration?: number) { cleanup(); video.src = ''; resolve(normalizeDuration(duration) || undefined) }
    function onLoadedMetadata() { finish(video.duration) }
    function onError() { finish(undefined) }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('error', onError)
    video.load()
  })
}

function getCameraSrc(camera: CameraEnum, video: Video): string | undefined {
  switch (camera) {
    case CameraEnum.前: return video.src_f
    case CameraEnum.后: return video.src_b
    case CameraEnum.左: return video.src_l
    case CameraEnum.右: return video.src_r
  }
}

function getFirstAvailableSrc(video: Video): string | undefined {
  return video.src_f || video.src_b || video.src_l || video.src_r
}

function getSrc(camera: CameraEnum, video: Video): string {
  return getCameraSrc(camera, video) || getFirstAvailableSrc(video) || ''
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlayerProps {
  videos?: Video[]
  eventTime?: number
  showDashcamData?: boolean
  currentGroup?: VideoGroup
  onVideoChange?: (video: Video) => void
}

// ─── Player component ─────────────────────────────────────────────────────────

const Player: React.FC<PlayerProps> = (props) => {
  const [layout, setLayout] = useState<'focus' | 'split'>('focus')
  const [currentCamera, setCurrentCamera] = useState(CameraEnum.前)
  const [currentClipIndex, setCurrentClipIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [currentTimelineTime, setCurrentTimelineTime] = useState(0)
  const [paused, setPaused] = useState(true)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [clipDurations, setClipDurations] = useState<number[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrubRef = useRef<HTMLDivElement>(null)
  const inputIsFocus = useRef(false)
  const durationLoadTokenRef = useRef(0)
  const autoPlayAfterSwitchRef = useRef(false)
  const playIntentRef = useRef(false)
  const { delayPlay } = useDelayPlay()

  const videos = useMemo(
    () => (props.videos ?? []).filter(video => Boolean(getFirstAvailableSrc(video))),
    [props.videos],
  )
  // 遥测异步到达时 videos 数组引用会更新但片段本身不变，此时不能重置播放
  const videosKey = useMemo(
    () => videos.map(video => getFirstAvailableSrc(video)).join('|'),
    [videos],
  )
  const loadedVideosKeyRef = useRef<string>()
  const currentVideo = videos[currentClipIndex]
  const showPlayerDebug = localStorage.getItem('playerDebug') === '1'
  const dashcamPoint = findDashcamPoint(currentVideo?.dashcam, currentTime)
  const showDashcamDebug = localStorage.getItem('dashcamDebug') === '1'
  const dashcamDebugText = showDashcamDebug ? formatDashcamDebugText(dashcamPoint) : ''

  // Telemetry
  const speedRaw = toFiniteNumber(dashcamPoint?.speed)
  const speedMps = toFiniteNumber(dashcamPoint?.speedMps)
  const speedKmh = speedRaw ?? (speedMps === undefined ? undefined : speedMps * 3.6)
  const speedText = Number.isFinite(speedKmh) ? String(Math.max(0, Math.round(speedKmh as number))) : '--'
  const steeringAngle = toFiniteNumber(dashcamPoint?.steeringAngle)
  const steeringRotate = Math.max(-540, Math.min(540, steeringAngle ?? 0))
  const steeringText = steeringAngle === undefined ? '--' : `${steeringAngle >= 0 ? '+' : ''}${steeringAngle.toFixed(1)}°`
  const signalState = normalizeSignal(dashcamPoint)
  const brakePercent = clampPercent(normalizeBrakePercent(dashcamPoint?.brakePressed))
  const acceleratorPercent = normalizeAcceleratorPercent(toFiniteNumber(dashcamPoint?.acceleratorPedal))
  const acceleratorValue = clampPercent(acceleratorPercent ?? 0)
  const acceleratorText = acceleratorPercent === undefined ? '--' : `${Math.round(acceleratorPercent)}%`

  const clipStarts = useMemo(() => {
    let acc = 0
    return clipDurations.map((duration) => {
      const start = acc; acc += normalizeDuration(duration); return start
    })
  }, [clipDurations])

  const totalDuration = useMemo(
    () => clipDurations.reduce((acc, duration) => acc + normalizeDuration(duration), 0),
    [clipDurations],
  )
  const currentClipDuration = normalizeDuration(clipDurations[currentClipIndex])
  const sliderMax = totalDuration > 0 ? totalDuration : 0.1

  const filenameNominalClipMs = useMemo(() => {
    if (videos.length < 2) return 60000
    const diffs = videos.slice(1)
      .map((video, index) => video.time - videos[index].time)
      .filter(diff => diff > 1000 && diff < 300000)
      .sort((a, b) => a - b)
    if (!diffs.length) return 60000
    return diffs[Math.floor(diffs.length / 2)]
  }, [videos])

  const filenameTimelineTotalMs = useMemo(() => {
    if (!videos.length) return 0
    if (videos.length === 1) return filenameNominalClipMs
    return Math.max(1, videos[videos.length - 1].time - videos[0].time + filenameNominalClipMs)
  }, [filenameNominalClipMs, videos])

  const eventTimelineTime = useMemo(() => {
    if (!props.eventTime || !videos.length || filenameTimelineTotalMs <= 0) return undefined
    const offsetMs = props.eventTime - videos[0].time
    return Math.max(0, offsetMs / 1000)
  }, [filenameTimelineTotalMs, props.eventTime, videos])

  const scrubRatio = sliderMax > 0 ? Math.min(1, Math.max(0, currentTimelineTime / sliderMax)) : 0
  const eventRatio = eventTimelineTime !== undefined && sliderMax > 0
    ? Math.min(1, Math.max(0, eventTimelineTime / sliderMax))
    : undefined

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (loadedVideosKeyRef.current === videosKey) return
    loadedVideosKeyRef.current = videosKey
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

    if (!videoRef.current || !videos.length) return
    videoRef.current.pause()
    videoRef.current.src = getSrc(CameraEnum.前, videos[0])
    videoRef.current.currentTime = 0

    const currentToken = durationLoadTokenRef.current
    const workerCount = Math.min(DURATION_LOAD_CONCURRENCY, videos.length)
    let cursor = 0
    const worker = async () => {
      while (currentToken === durationLoadTokenRef.current) {
        const index = cursor; cursor += 1
        if (index >= videos.length) return
        const duration = await loadClipDuration(getSrc(CameraEnum.前, videos[index]))
        const nextDuration = normalizeDuration(duration)
        if (!nextDuration || currentToken !== durationLoadTokenRef.current) continue
        setClipDurations((prev) => {
          if (!prev.length || index >= prev.length) return prev
          if (Math.abs(normalizeDuration(prev[index]) - nextDuration) < 0.01) return prev
          const next = [...prev]; next[index] = nextDuration; return next
        })
      }
    }
    for (let i = 0; i < workerCount; i++) void worker()
  }, [videosKey, videos])

  useEffect(() => {
    setCurrentTimelineTime((clipStarts[currentClipIndex] ?? 0) + currentTime)
  }, [clipStarts, currentClipIndex, currentTime])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.playbackRate = playbackRate
  }, [playbackRate, currentClipIndex])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function switchToClip(nextIndex: number, autoplay: boolean, startTime = 0) {
    if (!videoRef.current || !videos[nextIndex]) return
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
    if (!autoplay) setPaused(true)
    props.onVideoChange?.(nextVideo)
  }

  function onCanPlay() {
    if (!videoRef.current || !autoPlayAfterSwitchRef.current) return
    autoPlayAfterSwitchRef.current = false
    videoRef.current.playbackRate = playbackRate
    void videoRef.current.play().catch(() => { delayPlay(videoRef.current as HTMLVideoElement) })
  }

  function seekTimeline(nextTimelineTime: number) {
    if (!videoRef.current || !videos.length) return
    const clamped = Math.min(Math.max(nextTimelineTime, 0), sliderMax)
    const { index, time } = locateClipByTimelineTime(clamped, clipDurations)
    const autoplay = playIntentRef.current
    if (index === currentClipIndex) {
      videoRef.current.pause()
      videoRef.current.currentTime = time
      setCurrentTime(time)
      setCurrentTimelineTime(clamped)
      if (autoplay) delayPlay(videoRef.current)
      return
    }
    switchToClip(index, autoplay, time)
  }

  function seekOffset(deltaSeconds: number) { seekTimeline(currentTimelineTime + deltaSeconds) }

  function handleScrubClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!scrubRef.current) return
    const rect = scrubRef.current.getBoundingClientRect()
    const r = (e.clientX - rect.left) / rect.width
    seekTimeline(Math.max(0, Math.min(1, r)) * sliderMax)
  }

  function onKeyUp(e: React.KeyboardEvent) {
    e.preventDefault()
    switch (e.code) {
      case 'Space': videoRef.current?.paused ? play() : pause(); break
      case 'ArrowLeft': seekOffset(-10); break
      case 'ArrowRight': seekOffset(10); break
      case 'KeyW': onSelectCamera(CameraEnum.前); break
      case 'KeyS': onSelectCamera(CameraEnum.后); break
      case 'KeyA': onSelectCamera(CameraEnum.左); break
      case 'KeyD': onSelectCamera(CameraEnum.右); break
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
    if (shouldResume) delayPlay(videoRef.current)
  }

  function onTimeupdate() {
    if (!videoRef.current) return
    const duration = normalizeDuration(clipDurations[currentClipIndex]) || normalizeDuration(videoRef.current.duration)
    const time = videoRef.current.currentTime
    if (duration && time >= duration - 0.05) {
      const nextIndex = currentClipIndex + 1
      if (nextIndex < videos.length) { switchToClip(nextIndex, playIntentRef.current); return }
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
    if (!loadedDuration) return
    setClipDurations((prev) => {
      if (!prev.length || currentClipIndex >= prev.length) return prev
      if (Math.abs(normalizeDuration(prev[currentClipIndex]) - loadedDuration) < 0.01) return prev
      const next = [...prev]; next[currentClipIndex] = loadedDuration; return next
    })
  }

  function onVideoError() {
    if (!videos.length) return
    const nextIndex = currentClipIndex + 1
    if (nextIndex < videos.length) { switchToClip(nextIndex, playIntentRef.current); return }
    playIntentRef.current = false
    setPaused(true)
  }

  // ── Derived display values ───────────────────────────────────────────────────

  const currentCam = CAMERAS.find(c => c.enum === currentCamera) ?? CAMERAS[0]
  const typeLabels = { 1: '事件', 2: '哨兵', 3: '记录仪' } as Record<number, string>
  const recLabel = typeLabels[props.currentGroup?.type ?? -1] ?? '记录仪'
  const tsText = currentVideo
    ? dayjs(currentVideo.time + currentTime * 1000).format('YYYY-MM-DD HH:mm:ss')
    : '--'
  const latLng = (props.currentGroup?.latitude !== undefined && props.currentGroup?.longitude !== undefined)
    ? `${props.currentGroup.latitude.toFixed(4)}, ${props.currentGroup.longitude.toFixed(4)}`
    : undefined

  // ── Shared overlay elements ──────────────────────────────────────────────────

  const recPill = (
    <div style={S.recPill}>
      <span style={S.recDot} />
      REC · {recLabel}
    </div>
  )
  const tsPill = <div style={S.timestamp}>{tsText}</div>
  const geoPill = latLng ? (
    <div style={S.geoPill}>
      <Icons.Map size={11} />
      {latLng}
    </div>
  ) : null

  // ── HUD ─────────────────────────────────────────────────────────────────────

  const hudElement = props.showDashcamData !== false && dashcamPoint ? (
    <div style={S.hud}>
      <div style={S.hudTopRow}>
        <div style={S.gearBadge}>{formatGear(dashcamPoint.gear)}</div>
        <div style={S.apWrap}>
          <span style={S.apLabel}>Autopilot</span>
          <span style={S.apState}>{formatAutopilot(dashcamPoint.autopilotState)}</span>
        </div>
        <div style={S.steeringWrap}>
          <img
            alt="steering"
            src={STEERING_WHEEL_ICON}
            style={{ width: 28, height: 28, display: 'block', transformOrigin: '50% 50%', transform: `rotate(${steeringRotate}deg)`, transition: 'transform 200ms' }}
          />
          <span style={S.steeringText}>{steeringText}</span>
        </div>
      </div>
      <div style={S.speedRow}>
        <div style={{ ...S.turnArrow, ...(signalState.left ? S.turnActive : {}) }}>
          <Icons.ArrowLeft size={24} stroke={2} />
        </div>
        <div style={S.speedBlock}>
          <span style={S.speedValue}>{speedText}</span>
          <span style={S.speedUnit}>KM/H</span>
        </div>
        <div style={{ ...S.turnArrow, ...(signalState.right ? S.turnActive : {}) }}>
          <Icons.ArrowRight size={24} stroke={2} />
        </div>
      </div>
      <div style={S.pedalRow}>
        <div style={S.pedal}>
          <div style={{ ...S.pedalFill, width: `${brakePercent}%`, background: 'oklch(0.55 0.20 25 / 0.55)' }} />
          <span style={S.pedalLabel}>刹车</span>
          <span style={S.pedalValue}>{Math.round(brakePercent)}%</span>
        </div>
        <div style={S.pedal}>
          <div style={{ ...S.pedalFill, width: `${acceleratorValue}%`, background: 'oklch(0.55 0.16 150 / 0.55)' }} />
          <span style={S.pedalLabel}>电门</span>
          <span style={S.pedalValue}>{acceleratorText}</span>
        </div>
      </div>
      {showDashcamDebug && dashcamDebugText && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--fg-3)', wordBreak: 'break-all' }}>{dashcamDebugText}</div>
      )}
    </div>
  ) : null

  // ── Video element (always same DOM position) ─────────────────────────────────

  const videoElement = (
    <video
      muted
      ref={videoRef}
      style={S.videoFill}
      onCanPlay={onCanPlay}
      onError={onVideoError}
      onLoadedMetadata={onLoadedMetadata}
      onPause={() => setPaused(true)}
      onPlay={() => setPaused(false)}
      onTimeUpdate={onTimeupdate}
    />
  )

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!currentVideo) {
    return (
      <div style={S.root}>
        <div style={S.empty}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12, color: 'var(--fg-3)' }}>▶</div>
            <div>选择左侧片段开始播放</div>
          </div>
        </div>
        <input
          autoFocus
          className="play-focus-input"
          style={S.focusInput}
          onBlur={() => { inputIsFocus.current = false }}
          onFocus={() => { inputIsFocus.current = true }}
          onKeyUp={onKeyUp}
        />
      </div>
    )
  }

  return (
    <div style={S.root}>
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={S.toolbar}>
        <div style={S.toolbarLeft}>
          <span style={S.toolbarLabel}>画面布局</span>
          <div style={S.layoutSeg}>
            {([
              { key: 'focus' as const, label: '单画面', icon: <Icons.Camera size={12} /> },
              { key: 'split' as const, label: '四分屏', icon: <Icons.Grid size={12} /> },
            ] as const).map(opt => (
              <button
                key={opt.key}
                style={{ ...S.layoutBtn, ...(layout === opt.key ? S.layoutBtnActive : {}) }}
                type="button"
                onClick={() => setLayout(opt.key)}
              >
                {opt.icon}{opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={S.toolbarMeta}>
          <span style={S.toolbarMetaItem}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
            4路同步
          </span>
          <span style={S.toolbarMetaItem}>
            片段 {currentClipIndex + 1}/{videos.length}
          </span>
        </div>
      </div>

      {/* ── Stage ──────────────────────────────────────────────────────────── */}
      <div style={S.stage}>
        {layout === 'split' ? (
          <>
            {/* Main video hidden but playing for time tracking */}
            <div style={S.primaryHidden}>{videoElement}</div>

            {/* Split 2×2 grid */}
            <div style={S.splitContainer}>
              <div style={S.splitTopBar}>
                {recPill}
                {tsPill}
                {geoPill}
              </div>
              <div style={S.splitGrid}>
                {CAMERAS.map(cam => (
                  <div
                    key={cam.enum}
                    style={S.splitCell}
                    onDoubleClick={() => { onSelectCamera(cam.enum); setLayout('focus') }}
                  >
                    <MiniPlay
                      currentTime={currentTime}
                      paused={paused}
                      playbackRate={playbackRate}
                      src={getSrc(cam.enum, currentVideo)}
                      onClick={() => { onSelectCamera(cam.enum); setLayout('focus') }}
                    />
                    <div style={S.splitCellScrim} />
                    <span style={S.splitCellLabel}>{cam.short}</span>
                  </div>
                ))}
              </div>
              {hudElement}
            </div>
          </>
        ) : (
          /* Focus mode */
          <div style={S.focusGrid}>
            {/* Primary view */}
            <div style={S.primary}>
              {videoElement}
              <div style={S.scrim} />
              <div style={S.topRow}>
                {recPill}
                {tsPill}
                {geoPill}
              </div>
              <div style={S.camLabel}>{currentCam.short}</div>
              {hudElement}
            </div>

            {/* Camera tile column */}
            <div style={S.camTileCol}>
              {CAMERAS.map(cam => {
                const isActive = currentCamera === cam.enum
                return (
                  <div
                    key={cam.enum}
                    style={{ ...S.camTile, ...(isActive ? S.camTileActive : {}) }}
                    onClick={() => onSelectCamera(cam.enum)}
                  >
                    {isActive ? (
                      <div style={S.activePlaceholder}>
                        <Icons.Camera size={16} style={{ color: 'var(--accent)', opacity: 0.6 }} />
                      </div>
                    ) : (
                      <MiniPlay
                        currentTime={currentTime}
                        paused={paused}
                        playbackRate={playbackRate}
                        src={getSrc(cam.enum, currentVideo)}
                        onClick={() => onSelectCamera(cam.enum)}
                      />
                    )}
                    <span style={S.camTag}>{cam.short}</span>
                    {isActive && <span style={S.camActiveDot} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <div style={S.timelineWrap}>
        <div style={S.timeline}>
          <div style={S.timelineTopRow}>
            {/* Transport controls */}
            <div style={S.transport}>
              <button style={S.tBtn} title="-30s" type="button" onClick={() => seekOffset(-30)}>
                <Icons.SkipBack size={15} />
              </button>
              <button style={S.tBtn} title="-10s" type="button" onClick={() => seekOffset(-10)}>
                <Icons.Back10 size={15} />
              </button>
              <button style={S.playBtn} title={paused ? '播放' : '暂停'} type="button" onClick={() => paused ? play() : pause()}>
                {paused ? <Icons.Play size={14} /> : <Icons.Pause size={14} />}
              </button>
              <button style={S.tBtn} title="+10s" type="button" onClick={() => seekOffset(10)}>
                <Icons.Fwd10 size={15} />
              </button>
              <button style={S.tBtn} title="+30s" type="button" onClick={() => seekOffset(30)}>
                <Icons.SkipForward size={15} />
              </button>
            </div>

            <button
              style={S.rateBtn}
              title="播放速度"
              type="button"
              onClick={() => setPlaybackRate(r => nextPlaybackRate(r))}
            >
              {playbackRate}×
            </button>

            <span style={S.timeText}>{fmtTime(currentTimelineTime)}</span>

            {/* Scrubber */}
            <div ref={scrubRef} style={S.scrubWrap} onClick={handleScrubClick}>
              <div style={S.scrubTrack}>
                <div style={{ ...S.scrubProgress, width: `${scrubRatio * 100}%` }} />
              </div>
              <div style={S.scrubSegments}>
                {clipStarts.slice(1).map((start, i) => (
                  <div key={i} style={{ ...S.segMark, left: `${(start / sliderMax) * 100}%` }} />
                ))}
              </div>
              {eventRatio !== undefined && (
                <div style={{ ...S.eventMark, left: `${eventRatio * 100}%` }}>
                  <div style={S.eventMarkDot} />
                </div>
              )}
              <div style={{ ...S.scrubThumb, left: `${scrubRatio * 100}%` }} />
            </div>

            <span style={{ ...S.timeText, ...S.timeTextMuted }}>
              {fmtTime(totalDuration || currentClipDuration)}
            </span>

            <button style={S.tBtn} title="全屏" type="button">
              <Icons.Fullscreen size={15} />
            </button>
          </div>

          <div style={S.timelineMeta}>
            <div style={S.metaChips}>
              <span style={S.metaChip}>
                <span style={{ ...S.metaChipDot, background: 'oklch(0.78 0.13 220)' }} />
                播放进度
              </span>
              <span style={S.metaChip}>
                <span style={{ ...S.metaChipDot, background: 'var(--danger)' }} />
                事件触发点
              </span>
              <span style={S.metaChip}>
                <span style={{ ...S.metaChipDot, background: 'var(--fg-3)' }} />
                片段分割
              </span>
            </div>
            <div>
              段 {currentClipIndex + 1} / {videos.length}
            </div>
          </div>
        </div>
      </div>

      {showPlayerDebug && (
        <div style={S.debugPanel}>
          {`clip=${currentClipIndex + 1}/${videos.length} currentTime=${currentTime.toFixed(3)}s timeline=${currentTimelineTime.toFixed(3)}s max=${sliderMax.toFixed(3)}s eventTimeline=${eventTimelineTime?.toFixed(3) ?? '-'}`}
        </div>
      )}

      <input
        autoFocus
        style={S.focusInput}
        onBlur={() => { inputIsFocus.current = false }}
        onFocus={() => { inputIsFocus.current = true }}
        onKeyUp={onKeyUp}
      />
    </div>
  )
}

export default Player
