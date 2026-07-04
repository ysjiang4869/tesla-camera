import React from 'react'
import {
  Tooltip,
  Body1Strong,
  Button,
} from '@fluentui/react-components'
import { FolderAdd24Regular } from '@fluentui/react-icons'
import dayjs from 'dayjs'
import {
  type OriginVideo, type OriginVideoGroup, TypeEnum, type VideoFile, type EventJson, type FileData,
} from '../model'
import {
  getClipPrefix, isDashcamMetaFile, mergeDashcamPoints, parseDashcamTelemetry, parseDashcamFromMp4,
} from '../dashcam'
import { DEFAULT_THUMBNAIL, getCachedVideoThumbnail } from '../thumbnail'

interface DirectoryAccessProps {
  onAccess: (accessFile: OriginVideoGroup[]) => void
}

async function getDirFiles(fs: FileSystemDirectoryHandle, path = '') {
  const files: VideoFile[] = []
  const fsHandles = await fs.values()
  for await (const fsHandle of fsHandles) {
    const currentPath = `${path}/${fsHandle.name}`
    if (fsHandle.kind === 'file') {
      files.push({ fs: fsHandle, path: currentPath, dir: `${path}/` })
    }
    if (fsHandle.kind === 'directory') {
      files.push(...await getDirFiles(fsHandle, currentPath))
    }
  }
  return files
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

function normalizeDirPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function getDirBaseName(dir: string): string {
  const normalized = normalizeDirPath(dir)
  const trimmed = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
  const index = trimmed.lastIndexOf('/')
  if (index < 0) {
    return trimmed
  }
  return trimmed.slice(index + 1)
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

function attachThumbnailLoaders(groups: OriginVideoGroup[]) {
  groups.forEach((group) => {
    const candidates = group.clips.filter(item => item.src_f).slice(0, 3)
    if (!candidates.length) {
      return
    }
    group.loadThumbnail = async () => {
      for (let i = 0; i < candidates.length; i++) {
        const clip = candidates[i]
        try {
          const thumbnail = await getCachedVideoThumbnail(clip.src_f.path, async () => (await clip.src_f.get()).url)
          if (thumbnail) {
            return thumbnail
          }
        } catch {
          // 尝试下一段
        }
      }
      return undefined
    }
  })
}

function convertFiles(videoFiles: VideoFile[]): OriginVideo[] {
  const reg = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}-.+/
  const videos: Record<string, Partial<OriginVideo>> = {}
  videoFiles.forEach(({ fs, path, dir }) => {
    if (!reg.test(fs.name)) {
      return
    }
    const name = fs.name.slice(0, 19)
    let exists = videos[name]
    if (!exists) {
      exists = {
        title: nameToTitle(name),
        time: nameToTime(name),
        type: pathToType(path),
        dir,
      }
      videos[name] = exists
    }
    const fsData: FileData = {
      async get() {
        return {
          url: URL.createObjectURL(await fs.getFile()),
          name,
        }
      },
      async getDashcam() {
        const file = await fs.getFile()
        return parseDashcamFromMp4(await file.arrayBuffer())
      },
      name,
      path,
    }
    if (fs.name.includes('front')) {
      exists.src_f = fsData
    }
    if (fs.name.includes('back')) {
      exists.src_b = fsData
    }
    if (fs.name.includes('right_repeater')) {
      exists.src_r = fsData
    }
    if (fs.name.includes('left_repeater')) {
      exists.src_l = fsData
    }
  })
  return Object.values(videos) as OriginVideo[]
}

const DirectoryAccess: React.FC<React.PropsWithChildren<DirectoryAccessProps>> = props => {
  const loadTokenRef = React.useRef(0)

  async function onSelectFile() {
    const loadToken = loadTokenRef.current + 1
    loadTokenRef.current = loadToken
    const dirHandle = await window.showDirectoryPicker()
    const files = await getDirFiles(dirHandle)
    const videos = convertFiles(files)
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
        const content = await file.fs.getFile()
        eventByDir[normalizeDirPath(file.dir)] = JSON.parse(await content.text())
      } catch {
        // ignore malformed event files
      }
    }
    for (let i = 0; i < dashcamFiles.length; i++) {
      const file = dashcamFiles[i]
      const prefix = getClipPrefix(file.fs.name) ?? getClipPrefix(file.path)
      if (!prefix) {
        continue
      }
      const current = videoByPrefix[prefix]
      if (!current) {
        continue
      }
      const content = await file.fs.getFile()
      const points = parseDashcamTelemetry(await content.text(), file.path, current.time)
      if (points.length) {
        current.dashcam = mergeDashcamPoints(current.dashcam, points)
      }
    }
    const groups = buildVideoGroups(videos, eventByDir)
    attachThumbnailLoaders(groups)
    if (loadTokenRef.current !== loadToken) {
      return
    }
    props.onAccess(groups)
  }
  return (
    <Tooltip content={<>选择车载U盘中的<Body1Strong>TeslaCam</Body1Strong>目录，或者是<Body1Strong>TeslaCam</Body1Strong>文件目录的拷贝</>} relationship="label">
      <Button icon={<FolderAdd24Regular />} size="large" onClick={() => onSelectFile()} />
    </Tooltip>
  )
}

export default DirectoryAccess
