import { Command } from '@tauri-apps/api/shell'
import { exists, createDir, removeFile } from '@tauri-apps/api/fs'
import { appCacheDir, join } from '@tauri-apps/api/path'
import { thumbnailQueue } from './thumbnail-queue'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {}

let cacheDir: string | undefined

async function getCacheDir(): Promise<string> {
  if (cacheDir) return cacheDir
  const base = await appCacheDir()
  const dir = await join(base, 'thumbnails')
  if (!await exists(dir)) {
    await createDir(dir, { recursive: true })
  }
  cacheDir = dir
  return dir
}

async function hashPath(path: string): Promise<string> {
  const encoded = new TextEncoder().encode(path)
  const hashBuffer = await crypto.subtle.digest('SHA-1', encoded)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function convertFileSrc(filePath: string, protocol = 'asset'): string {
  const path = encodeURIComponent(filePath)
  return navigator.userAgent.includes('Windows')
    ? `https://${protocol}.localhost/${path}`
    : `${protocol}://localhost/${path}`
}

const pendingMap = new Map<string, Promise<string | undefined>>()
const negativeCache = new Set<string>()
const USE_FFMPEG_THUMBNAIL = true

async function extractThumbnail(videoPath: string): Promise<string | undefined> {
  if (!USE_FFMPEG_THUMBNAIL) return undefined

  const dir = await getCacheDir()
  const key = await hashPath(videoPath)
  const cacheFile = await join(dir, `${key}.jpg`)

  if (await exists(cacheFile)) {
    return convertFileSrc(cacheFile)
  }

  return new Promise<string | undefined>((resolve) => {
    let settled = false
    let child: { kill: () => Promise<void> } | undefined

    const timeout = setTimeout(async () => {
      if (settled) return
      settled = true
      await child?.kill().catch(noop)
      resolve(undefined)
    }, 8000)

    const command = Command.sidecar('binaries/ffmpeg', [
      '-y',
      '-ss', '1',
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=224:-1',
      '-q:v', '5',
      cacheFile,
    ])

    command.on('close', async (data) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (data.code === 0 && await exists(cacheFile)) {
        resolve(convertFileSrc(cacheFile))
      } else {
        await removeFile(cacheFile).catch(noop)
        resolve(undefined)
      }
    })

    command.on('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(undefined)
    })

    command.spawn().then(c => { child = c }).catch(() => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(undefined)
    })
  })
}

export async function getCachedVideoThumbnailTauri(
  videoPath: string,
  priority: 'visible' | 'background' = 'background',
): Promise<string | undefined> {
  if (negativeCache.has(videoPath)) return undefined

  const pending = pendingMap.get(videoPath)
  if (pending) return pending

  const task = thumbnailQueue.enqueue(
    () => extractThumbnail(videoPath).then(result => {
      if (!result) negativeCache.add(videoPath)
      pendingMap.delete(videoPath)
      return result
    }),
    priority,
  )

  pendingMap.set(videoPath, task)
  return task
}

export function clearThumbnailTauriState() {
  pendingMap.clear()
  negativeCache.clear()
  thumbnailQueue.clear()
}
