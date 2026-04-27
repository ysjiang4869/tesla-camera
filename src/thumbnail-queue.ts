type Priority = 'visible' | 'background'

interface Task<T> {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  priority: Priority
}

class ThumbnailQueue {
  private visibleQueue: Task<unknown>[] = []
  private backgroundQueue: Task<unknown>[] = []
  private running = 0
  private readonly concurrency: number

  constructor() {
    this.concurrency = Math.max(2, Math.min(4, Math.floor(navigator.hardwareConcurrency / 2)))
  }

  enqueue<T>(run: () => Promise<T>, priority: Priority): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: Task<T> = { run, resolve: resolve as (v: unknown) => void, reject, priority }
      if (priority === 'visible') {
        this.visibleQueue.push(task as Task<unknown>)
      } else {
        this.backgroundQueue.push(task as Task<unknown>)
      }
      this.tick()
    })
  }

  private tick() {
    while (this.running < this.concurrency) {
      const task = this.visibleQueue.shift() ?? this.backgroundQueue.shift()
      if (!task) break
      this.running++
      task.run().then(task.resolve, task.reject).finally(() => {
        this.running--
        this.tick()
      })
    }
  }

  clear() {
    const cancelled = new Error('cancelled')
    this.visibleQueue.splice(0).forEach(t => t.reject(cancelled))
    this.backgroundQueue.splice(0).forEach(t => t.reject(cancelled))
  }
}

export const thumbnailQueue = new ThumbnailQueue()
