const thumbnailCache = new Map<string, Promise<string | undefined>>()

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
    const onLoadedData = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('failed to load video frame'))
    }
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadeddata', onLoadedData)
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
  return task
}
