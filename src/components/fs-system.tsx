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
import {
  getClipPrefix, isDashcamMetaFile, mergeDashcamPoints, parseDashcamTelemetry,
} from '../dashcam'
import { DEFAULT_THUMBNAIL, getCachedVideoThumbnail } from '../thumbnail'

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
  let changed = false
  for (let i = 0; i < groups.length; i++) {
    if (isCanceled()) {
      return
    }
    const first = groups[i].clips[0]
    if (!first) {
      continue
    }
    const thumbnail = await getCachedVideoThumbnail(first.src_f.path, async () => (await first.src_f.get()).url)
    if (isCanceled()) {
      return
    }
    if (thumbnail && thumbnail !== groups[i].thumbnail) {
      groups[i].thumbnail = thumbnail
      changed = true
      onChange([...groups])
    }
  }
  if (changed && !isCanceled()) {
    onChange([...groups])
  }
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
      const videoByPrefix = videos.reduce<Record<string, OriginVideo>>((prev, item) => {
        const prefix = dayjs(item.time).format('YYYY-MM-DD_HH-mm-ss')
        prev[prefix] = item
        return prev
      }, {})
      const eventsFiles = files.filter(({ path }) => /.+event.json$/i.test(path))
      const dashcamFiles = files.filter(({ path }) => isDashcamMetaFile(path))
      const eventByDir: Record<string, EventJson> = {}
      for (let i = 0; i < eventsFiles.length; i++) {
        const file = eventsFiles[i]
        try {
          const eventJsonText = await readTextFile(file.path)
          eventByDir[normalizeDirPath(getParentDir(file.path))] = JSON.parse(eventJsonText)
        } catch {
          // ignore malformed event files
        }
      }
      for (let i = 0; i < dashcamFiles.length; i++) {
        const file = dashcamFiles[i]
        const prefix = getClipPrefix(file.name) ?? getClipPrefix(file.path)
        if (!prefix) {
          continue
        }
        const current = videoByPrefix[prefix]
        if (!current) {
          continue
        }
        const text = await readTextFile(file.path)
        const points = parseDashcamTelemetry(text, file.path, current.time)
        if (points.length) {
          current.dashcam = mergeDashcamPoints(current.dashcam, points)
        }
      }
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
