import React from 'react'
import {
  Tooltip,
  Body1Strong,
  Button,
} from '@fluentui/react-components'
import { FolderAdd24Regular } from '@fluentui/react-icons'
import dayjs from 'dayjs'
import {
  type OriginVideo, type OriginVideoGroup, TypeEnum, type EventJson,
  type FileData, type DashcamPoint,
} from '../model'
import { invoke, Channel, convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { DEFAULT_THUMBNAIL } from '../thumbnail'

// ─── Rust 命令返回结构（见 src-tauri/src/scan.rs / thumbnails.rs）─────────────

interface ScanClip {
  time: number
  timeKey: string
  front?: string
  back?: string
  left?: string
  right?: string
}

interface ScanGroup {
  id: string
  title: string
  dir: string
  time: number
  type: TypeEnum
  clips: ScanClip[]
  event?: EventJson
}

interface ThumbnailResult {
  videoPath: string
  cachePath?: string
}

interface FsSystemProps {
  onAccess: (accessFile: OriginVideoGroup[]) => void
}

function toNumber(value?: string): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// ─── 缩略图微批处理：50ms 窗口内的可见卡片请求合并为一次 Rust 调用 ────────────

interface PendingThumbnail {
  path: string
  resolve: (url: string | undefined) => void
}

let pendingThumbnails: PendingThumbnail[] = []
let batchTimer: number | undefined

async function flushThumbnailBatch() {
  batchTimer = undefined
  const batch = pendingThumbnails
  pendingThumbnails = []
  if (!batch.length) {
    return
  }
  const byPath = new Map(batch.map(item => [item.path, item]))
  const onThumbnail = new Channel<ThumbnailResult>()
  onThumbnail.onmessage = (message) => {
    const pending = byPath.get(message.videoPath)
    if (pending) {
      byPath.delete(message.videoPath)
      pending.resolve(message.cachePath ? convertFileSrc(message.cachePath) : undefined)
    }
  }
  try {
    await invoke('request_thumbnails', { paths: batch.map(item => item.path), onThumbnail })
  } catch {
    // 取消或 ffmpeg 不可用：下方统一按无缩略图收尾
  }
  byPath.forEach(item => item.resolve(undefined))
}

function requestThumbnail(path: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    pendingThumbnails.push({ path, resolve })
    if (batchTimer === undefined) {
      batchTimer = window.setTimeout(() => { void flushThumbnailBatch() }, 50)
    }
  })
}

function toFileData(path: string): FileData {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return {
    async get() {
      // 视频走自定义 stream 协议（Range 流式），asset 协议对媒体支持不佳
      return { url: convertFileSrc(path, 'stream'), name }
    },
    async getDashcam() {
      return invoke<DashcamPoint[]>('parse_telemetry', { path })
    },
    name,
    path,
  }
}

function convertScanGroups(scanGroups: ScanGroup[]): OriginVideoGroup[] {
  return scanGroups.map((item) => {
    const clips = item.clips.map((clip) => {
      const video: Partial<OriginVideo> = {
        title: dayjs(clip.time).format('YYYY-MM-DD HH:mm'),
        time: clip.time,
        type: item.type,
        dir: item.dir,
      }
      if (clip.front) {
        video.src_f = toFileData(clip.front)
      }
      if (clip.back) {
        video.src_b = toFileData(clip.back)
      }
      if (clip.left) {
        video.src_l = toFileData(clip.left)
      }
      if (clip.right) {
        video.src_r = toFileData(clip.right)
      }
      return video as OriginVideo
    })
    const front = item.clips.find(clip => clip.front)?.front
    const group: OriginVideoGroup = {
      id: item.id,
      title: item.title,
      time: item.time,
      type: item.type,
      dir: item.dir,
      clips,
      thumbnail: DEFAULT_THUMBNAIL,
      loadThumbnail: front ? () => requestThumbnail(front) : undefined,
    }
    if (item.event) {
      group.event = dayjs(item.event.timestamp).valueOf()
      group.city = item.event.city
      group.latitude = toNumber(item.event.est_lat)
      group.longitude = toNumber(item.event.est_lon)
      group.reason = item.event.reason
    }
    return group
  })
}

const FsSystem: React.FC<FsSystemProps> = props => {
  const loadTokenRef = React.useRef(0)

  async function onSelectFile() {
    const loadToken = loadTokenRef.current + 1
    loadTokenRef.current = loadToken
    await invoke('cancel_thumbnails').catch(() => undefined)
    const teslaCamDir = await open({
      directory: true,
      multiple: false,
      recursive: true,
    })
    if (!teslaCamDir) {
      return
    }
    const scanGroups = await invoke<ScanGroup[]>('scan_teslacam', { dir: teslaCamDir })
    if (loadTokenRef.current !== loadToken) {
      return
    }
    props.onAccess(convertScanGroups(scanGroups))
  }
  return (
    <Tooltip
      content={<>选择车载U盘中的<Body1Strong>TeslaCam</Body1Strong>目录，或者是<Body1Strong>TeslaCam</Body1Strong>文件目录的拷贝</>}
      relationship="label"
    >
      <Button
        icon={<FolderAdd24Regular />}
        size="large"
        onClick={() => onSelectFile()}
      />
    </Tooltip>
  )
}

export default FsSystem
