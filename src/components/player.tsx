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
import { findDashcamPoint, formatDashcamDebugText, formatDashcamText } from '../dashcam'

import { type Video, CameraEnum } from '../model'

const PLAYBACK_RATE_CYCLE = [1, 1.5, 2, 0.5]
const DURATION_LOAD_CONCURRENCY = 4
const EVENT_MARKER_VISUAL_HALF_WIDTH = 5

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
  dashcam: {
    position: 'absolute',
    left: '50%',
    bottom: '40px',
    transform: 'translateX(-50%)',
    textAlign: 'center',
    minWidth: '280px',
    maxWidth: '90%',
    color: tokens.colorNeutralBackground1Hover,
    fontSize: '16px',
    fontWeight: 500,
    lineHeight: '22px',
    whiteSpace: 'normal',
    ...shorthands.padding('4px', '10px'),
    backgroundColor: tokens.colorNeutralStencil1Alpha,
    ...shorthands.borderRadius('2px'),
  },
  dashcamDebug: {
    marginTop: '4px',
    fontSize: '12px',
    opacity: 0.9,
    whiteSpace: 'normal',
    wordBreak: 'break-all',
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
  const dashcamText = formatDashcamText(dashcamPoint)
  const showDashcamDebug = localStorage.getItem('dashcamDebug') === '1'
  const dashcamDebugText = showDashcamDebug ? formatDashcamDebugText(dashcamPoint) : ''

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
              {dashcamText ? (
                <div className={styles.dashcam}>
                  <div>{dashcamText}</div>
                  {dashcamDebugText ? <div className={styles.dashcamDebug}>{dashcamDebugText}</div> : null}
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
