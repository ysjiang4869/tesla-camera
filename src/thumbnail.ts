const thumbnailCache = new Map<string, Promise<string | undefined>>()
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="224" height="126" viewBox="0 0 224 126"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#d6d8dc"/><stop offset="100%" stop-color="#b9bcc2"/></linearGradient></defs><rect width="224" height="126" fill="url(#g)"/><g fill="#8a8f98"><rect x="88" y="46" width="48" height="34" rx="4"/><polygon points="106,55 122,63 106,71"/></g></svg>`
export const DEFAULT_THUMBNAIL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PLACEHOLDER_SVG)}`

function toBlob(canvas: HTMLCanvasElement, quality = 0.72): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', quality)
  })
}

async function captureFirstFrame(videoUrl: string): Promise<string | undefined> {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.crossOrigin = 'anonymous'
  video.src = videoUrl

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('load video frame timeout'))
    }, 3500)
    const onLoadedData = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('failed to load video frame'))
    }
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('canplay', onLoadedData)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('canplay', onLoadedData)
    video.addEventListener('error', onError)
    video.load()
  })

  const width = video.videoWidth || 320
  const height = video.videoHeight || 180
  const targetWidth = 224
  const targetHeight = Math.max(1, Math.round((height / width) * targetWidth))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    return undefined
  }
  context.drawImage(video, 0, 0, targetWidth, targetHeight)
  const blob = await toBlob(canvas)
  if (!blob) {
    return undefined
  }
  return URL.createObjectURL(blob)
}

export async function getCachedVideoThumbnail(cacheKey: string, getVideoUrl: () => Promise<string>): Promise<string | undefined> {
  const cached = thumbnailCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const task = (async () => {
    const videoUrl = await getVideoUrl()
    try {
      const thumbnail = await captureFirstFrame(videoUrl)
      return thumbnail
    } catch {
      return undefined
    } finally {
      if (videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  })()
  thumbnailCache.set(cacheKey, task)
  void task.then((result) => {
    if (!result && thumbnailCache.get(cacheKey) === task) {
      thumbnailCache.delete(cacheKey)
    }
  })
  return task
}
