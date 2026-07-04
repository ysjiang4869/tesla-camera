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

function toFileData(path: string): FileData {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return {
    async get() {
      return { url: convertFileSrc(path), name }
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
    const group: OriginVideoGroup = {
      id: item.id,
      title: item.title,
      time: item.time,
      type: item.type,
      dir: item.dir,
      clips,
      thumbnail: DEFAULT_THUMBNAIL,
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

async function hydrateGroupThumbnails(
  groups: OriginVideoGroup[],
  isCanceled: () => boolean,
  onChange: (next: OriginVideoGroup[]) => void,
) {
  const groupByFront = new Map<string, OriginVideoGroup>()
  groups.forEach((group) => {
    const front = group.clips.find(clip => clip.src_f?.path)?.src_f.path
    if (front && !groupByFront.has(front)) {
      groupByFront.set(front, group)
    }
  })
  const paths = [...groupByFront.keys()]
  if (!paths.length) {
    return
  }

  let changed = false
  let changedCount = 0
  const flush = () => {
    if (!changed || isCanceled()) return
    changed = false
    onChange([...groups])
  }

  const onThumbnail = new Channel<ThumbnailResult>()
  onThumbnail.onmessage = (message) => {
    if (isCanceled() || !message.cachePath) {
      return
    }
    const group = groupByFront.get(message.videoPath)
    if (!group) {
      return
    }
    const url = convertFileSrc(message.cachePath)
    if (url !== group.thumbnail) {
      group.thumbnail = url
      changed = true
      changedCount += 1
      if (changedCount % 8 === 0) flush()
    }
  }
  try {
    await invoke('request_thumbnails', { paths, onThumbnail })
  } catch {
    // 取消或 ffmpeg 不可用时保留占位图
  }
  flush()
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
    const groups = convertScanGroups(scanGroups)
    props.onAccess(groups)
    void hydrateGroupThumbnails(
      groups,
      () => loadTokenRef.current !== loadToken,
      (next) => props.onAccess(next),
    )
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
