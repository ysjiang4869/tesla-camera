import React, { useRef, useEffect } from 'react'

interface MiniPlayProps {
  currentTime: number
  src: string
  paused: boolean
  playbackRate: number
  onClick: () => void
}

const MiniPlay: React.FC<MiniPlayProps> = (props) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!videoRef.current) return
    if (props.paused && !videoRef.current.paused) {
      videoRef.current.pause()
    }
    if (!props.paused && videoRef.current.paused) {
      videoRef.current.currentTime = props.currentTime
      videoRef.current.playbackRate = props.playbackRate
      if (playTimerRef.current) {
        clearTimeout(playTimerRef.current)
      }
      playTimerRef.current = window.setTimeout(() => {
        void videoRef.current?.play().catch((_e: unknown) => { return _e })
        playTimerRef.current = null
      }, 200)
    }
  }, [props.paused, props.currentTime, props.playbackRate])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.playbackRate = props.playbackRate
  }, [props.playbackRate])

  useEffect(() => {
    if (!videoRef.current) return
    if (props.paused) {
      videoRef.current.currentTime = props.currentTime
    }
  }, [props.currentTime, props.paused])

  return (
    <video
      muted
      ref={videoRef}
      src={props.src}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
      onClick={props.onClick}
    />
  )
}

export default MiniPlay
