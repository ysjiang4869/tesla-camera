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
      width: '8px',
      height: '8px',
      top: '-5px',
      left: '-3px',
      borderRadius: '50%',
      backgroundColor: tokens.colorPaletteRedForeground1,
    },
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

function getSrc(camera: CameraEnum, video: Video): string {
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
  const inputIsFocus = useRef(false)
  const durationLoadTokenRef = useRef(0)
  const autoPlayAfterSwitchRef = useRef(false)
  const playIntentRef = useRef(false)
  const { delayPlay } = useDelayPlay()
  const currentVideo = props.videos?.[currentClipIndex]
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
  const eventTimelineTime = useMemo(() => {
    if (!props.eventTime || !props.videos?.length || !clipDurations.length) {
      return undefined
    }
    const eventMs = props.eventTime
    const videos = props.videos
    let clipIndex = videos.length - 1
    if (eventMs <= videos[0].time) {
      clipIndex = 0
    } else {
      for (let i = 0; i < videos.length - 1; i++) {
        if (eventMs < videos[i + 1].time) {
          clipIndex = i
          break
        }
      }
    }
    const clipDuration = normalizeDuration(clipDurations[clipIndex])
    const clipStart = clipStarts[clipIndex] ?? 0
    const offsetSeconds = Math.max(
      0,
      Math.min(
        (eventMs - videos[clipIndex].time) / 1000,
        Math.max(clipDuration - 0.01, 0),
      ),
    )
    return Math.min(Math.max(clipStart + offsetSeconds, 0), sliderMax)
  }, [clipDurations, clipStarts, props.eventTime, props.videos, sliderMax])
  const eventMarkerLeft = useMemo(() => {
    if (eventTimelineTime === undefined || totalDuration <= 0) {
      return undefined
    }
    const percent = (eventTimelineTime / totalDuration) * 100
    return `${Math.max(0, Math.min(percent, 100))}%`
  }, [eventTimelineTime, totalDuration])

  useEffect(() => {
    setCurrentClipIndex(0)
    setCurrentTime(0)
    setCurrentTimelineTime(0)
    setPaused(true)
    setPlaybackRate(1)
    setCurrentCamera(CameraEnum.前)
    setClipDurations(buildInitialClipDurations(props.videos))
    durationLoadTokenRef.current += 1
    autoPlayAfterSwitchRef.current = false
    playIntentRef.current = false

    if (!videoRef.current || !props.videos?.length) {
      return
    }

    videoRef.current.pause()
    videoRef.current.src = getSrc(CameraEnum.前, props.videos[0])
    videoRef.current.currentTime = 0

    const currentToken = durationLoadTokenRef.current
    props.videos.forEach((video, index) => {
      void loadClipDuration(getSrc(CameraEnum.前, video)).then((duration) => {
        const nextDuration = normalizeDuration(duration)
        if (!nextDuration || currentToken !== durationLoadTokenRef.current) {
          return
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
      })
    })
  }, [props.videos])

  useEffect(() => {
    setCurrentTimelineTime((clipStarts[currentClipIndex] ?? 0) + currentTime)
  }, [clipStarts, currentClipIndex, currentTime])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.playbackRate = playbackRate
  }, [playbackRate, currentClipIndex])

  function switchToClip(nextIndex: number, autoplay: boolean, startTime = 0) {
    if (!videoRef.current || !props.videos?.[nextIndex]) {
      return
    }
    const nextVideo = props.videos[nextIndex]
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
  }

  function seekTimeline(nextTimelineTime: number) {
    if (!videoRef.current || !props.videos?.length) return
    const clamped = Math.min(Math.max(nextTimelineTime, 0), sliderMax)
    const { index, time } = locateClipByTimelineTime(clamped, clipDurations)
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
      if (props.videos && nextIndex < props.videos.length) {
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
              <div className={styles.sliderWrap}>
                <Slider
                  className={styles.slider}
                  max={sliderMax}
                  min={0}
                  value={Math.min(currentTimelineTime, sliderMax)}
                  onChange={(_, data) => seekTimeline(Number(data.value))}
                />
                {eventMarkerLeft ? <div className={styles.eventMarker} style={{ left: eventMarkerLeft }} /> : null}
              </div>
              <div className={styles.sliderTime}>{fmtTime(totalDuration || currentClipDuration)}</div>
            </div>
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
