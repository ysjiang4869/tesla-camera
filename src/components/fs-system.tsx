import React from 'react'
import {
  Tooltip,
  Body1Strong,
  Button,
} from '@fluentui/react-components'
import { FolderAdd24Regular } from '@fluentui/react-icons'
import dayjs from 'dayjs'
import {
  type OriginVideo, type OriginVideoGroup, TypeEnum, type TauriFile, type EventJson,
  type FileData,
} from '../model'
import { convertFileSrc } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'
import { readTextFile, readDir, readBinaryFile } from '@tauri-apps/api/fs'
import { DEFAULT_THUMBNAIL } from '../thumbnail'
import { getCachedVideoThumbnailTauri, clearThumbnailTauriState } from '../thumbnail-tauri'

const THUMBNAIL_CONCURRENCY = 4

interface FsSystemProps {
  onAccess: (accessFile: OriginVideoGroup[]) => void
}

function nameToTime(name: string): number {
  const date = name.slice(0, 10)
  const hours = name.slice(11, 13)
  const minutes = name.slice(14, 16)
  const seconds = name.slice(17, 19)
  return dayjs(`${date} ${hours}:${minutes}:${seconds}`).valueOf()
}

function nameToTitle(name: string): string {
  const time = nameToTime(name)
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}

function pathToType(path: string) {
  if (path.includes('SavedClips')) {
    return TypeEnum.事件
  }
  if (path.includes('RecentClips')) {
    return TypeEnum.行车记录仪
  }
  if (path.includes('SentryClips')) {
    return TypeEnum.哨兵
  }
  return TypeEnum.所有
}

function getDirFiles(files: TauriFile[]) {
  const result: TauriFile[] = []
  files.forEach(item => {
    if (item.children?.length) {
      result.push(...getDirFiles(item.children))
    } else {
      result.push(item)
    }
  })
  return result
}

function normalizeDirPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function getParentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx < 0) {
    return '/'
  }
  return `${normalized.slice(0, idx + 1)}`
}

function getDirBaseName(dir: string): string {
  const normalized = normalizeDirPath(dir)
  const trimmed = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
  const idx = trimmed.lastIndexOf('/')
  return idx > -1 ? trimmed.slice(idx + 1) : trimmed
}

function toNumber(value?: string): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildVideoGroups(videos: OriginVideo[], eventByDir: Record<string, EventJson>): OriginVideoGroup[] {
  const map: Record<string, OriginVideoGroup> = {}
  videos.forEach((item) => {
    const key = normalizeDirPath(item.dir)
    if (!map[key]) {
      map[key] = {
        id: key,
        title: getDirBaseName(item.dir),
        time: item.time,
        type: item.type,
        dir: item.dir,
        clips: [],
        thumbnail: DEFAULT_THUMBNAIL,
      }
    }
    const group = map[key]
    group.clips.push(item)
    if (item.time < group.time) {
      group.time = item.time
    }
  })
  const groups = Object.values(map)
    .map((item) => {
      item.clips = item.clips.sort((a, b) => a.time - b.time)
      const event = eventByDir[item.id]
      if (event) {
        item.event = dayjs(event.timestamp).valueOf()
        item.city = event.city
        item.latitude = toNumber(event.est_lat)
        item.longitude = toNumber(event.est_lon)
        item.reason = event.reason
      }
      return item
    })
    .sort((a, b) => b.time - a.time)
  return groups
}

async function hydrateGroupThumbnails(
  groups: OriginVideoGroup[],
  isCanceled: () => boolean,
  onChange: (next: OriginVideoGroup[]) => void,
) {
  if (!groups.length) return

  let changed = false
  let changedCount = 0
  const flush = () => {
    if (!changed || isCanceled()) return
    changed = false
    onChange([...groups])
  }

  await Promise.all(groups.map(async (group, index) => {
    if (isCanceled()) return
    const clip = group.clips.find(item => item.src_f?.path)
    if (!clip) return
    try {
      const thumbnail = await getCachedVideoThumbnailTauri(
        clip.src_f.path,
        index < THUMBNAIL_CONCURRENCY ? 'visible' : 'background',
      )
      if (isCanceled()) return
      if (thumbnail && thumbnail !== group.thumbnail) {
        group.thumbnail = thumbnail
        changed = true
        changedCount += 1
        if (changedCount % 8 === 0) flush()
      }
    } catch {
      // ignore
    }
  }))
  flush()
}

function convertVideoFiles(videoFiles: TauriFile[]): OriginVideo[] {
  const reg = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}-.+/
  const videos: Record<string, Partial<OriginVideo>> = {}
  videoFiles.forEach(({ name, path }) => {
    if (!reg.test(name)) {
      return
    }
    const timeName = name.slice(0, 19)
    let exists = videos[timeName]
    if (!exists) {
      exists = {
        title: nameToTitle(timeName),
        time: nameToTime(timeName),
        type: pathToType(path),
        dir: path.replace(name, ''),
      }
      videos[timeName] = exists
    }
    const fs: FileData = {
      async get() {
        return Promise.resolve({
          url: convertFileSrc(path),
          name,
        })
      },
      async getBuffer() {
        const binary = await readBinaryFile(path)
        return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
      },
      name,
      path,
    }
    if (name.includes('front')) {
      exists.src_f = fs
    }
    if (name.includes('back')) {
      exists.src_b = fs
    }
    if (name.includes('right_repeater')) {
      exists.src_r = fs
    }
    if (name.includes('left_repeater')) {
      exists.src_l = fs
    }
  })
  return Object.values(videos) as OriginVideo[]
}

const FsSystem: React.FC<FsSystemProps> = props => {
  const loadTokenRef = React.useRef(0)

  async function onSelectFile() {
    clearThumbnailTauriState()
    const loadToken = loadTokenRef.current + 1
    loadTokenRef.current = loadToken
    const teslaCamDir = await open({
      directory: true,
      multiple: false,
      recursive: true,
    })
    if (!teslaCamDir) {
      return
    }
    readDir(teslaCamDir as string, { recursive: true }).then(async res => {
      const files = getDirFiles(res as TauriFile[])
      const videos = convertVideoFiles(files)
      const eventsFiles = files.filter(({ path }) => /.+event.json$/i.test(path))
      const eventByDir: Record<string, EventJson> = {}

      // 并行读取所有 event.json（最多 8 个并发）
      const EVENT_CONCURRENCY = 8
      for (let i = 0; i < eventsFiles.length; i += EVENT_CONCURRENCY) {
        const batch = eventsFiles.slice(i, i + EVENT_CONCURRENCY)
        await Promise.all(batch.map(async (file) => {
          try {
            const text = await readTextFile(file.path)
            eventByDir[normalizeDirPath(getParentDir(file.path))] = JSON.parse(text)
          } catch {
            // ignore malformed event files
          }
        }))
      }

      // dashcam CSV/JSON 文件体积大且数量多，改为点击时从 mp4 按需解析
      // 此处跳过，避免启动时产生大量串行 IPC 读取

      const groups = buildVideoGroups(videos, eventByDir)
      props.onAccess(groups)
      void hydrateGroupThumbnails(
        groups,
        () => loadTokenRef.current !== loadToken,
        (next) => props.onAccess(next),
      )
    })
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
