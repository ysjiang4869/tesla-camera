export enum TypeEnum {
  '所有',
  '事件',
  '哨兵',
  '行车记录仪'
}

export enum CameraEnum {
  '前',
  '后',
  '左',
  '右'
}

export enum ExportStatusEnum {
  进行中,
  导出成功,
  导出失败
}

export interface ExportTaskType {
  path: string
  name: string
  exportDir: string
  status: number
  duration: number
  progress: number
  log: string[]
}

export interface FileData {
  get(): Promise<{ url: string; name: string }>
  /** 解析该视频内嵌的行车遥测数据（各平台自行选择最优实现） */
  getDashcam?: () => Promise<DashcamPoint[]>
  name: string
  path: string
}

export interface OriginVideo {
  title: string
  time: number
  type: TypeEnum
  dir: string
  src_f: FileData
  src_b: FileData
  src_r: FileData
  src_l: FileData
  event?: number
  dashcam?: DashcamPoint[]
}

export interface OriginVideoGroup {
  id: string
  title: string
  time: number
  type: TypeEnum
  dir: string
  clips: OriginVideo[]
  event?: number
  city?: string
  latitude?: number
  longitude?: number
  reason?: string
  thumbnail?: string
  /** 懒加载缩略图：卡片进入视口时才调用（各平台自行实现） */
  loadThumbnail?: () => Promise<string | undefined>
}

export interface OriginFSVideo {
  title: string
  time: number
  type: TypeEnum
  src_f: string
  src_b: string
  src_r: string
  src_l: string
}

export interface Video {
  title: string
  time: number
  type: TypeEnum
  dir: string
  src_f: string
  src_f_name: string
  src_b: string
  src_b_name: string
  src_r: string
  src_r_name: string
  src_l: string
  src_l_name: string
  src_f_path: string
  src_b_path: string
  src_r_path: string
  src_l_path: string
  dashcam?: DashcamPoint[]
}

export interface VideoGroup {
  id: string
  title: string
  time: number
  type: TypeEnum
  dir: string
  videos: Video[]
  event?: number
  city?: string
  latitude?: number
  longitude?: number
  reason?: string
  thumbnail?: string
}

export interface DashcamPoint {
  t: number
  metadataVersion?: number
  frameSeqNo?: number
  speed?: number
  speedMps?: number
  steeringAngle?: number
  gear?: string | number
  autopilotState?: string | number
  blinkerLeft?: boolean
  blinkerRight?: boolean
  brakePressed?: boolean | string | number
  acceleratorPedal?: number
  turnSignal?: string | number
  heading?: number
  latitude?: number
  longitude?: number
  elevation?: number
  accelX?: number
  accelY?: number
  accelZ?: number
  pitch?: number
  roll?: number
  yawRate?: number
  odometer?: number
  batteryLevel?: number
  powerKw?: number
  values?: Record<string, DashcamValue>
}

export type DashcamValue = string | number | boolean

export interface ModelState {
  type: TypeEnum
  current?: Video
  currentGroup?: VideoGroup
  list: OriginVideoGroup[]
  events: VideoFile[]
}

export interface VideoFile {
  fs: FileSystemFileHandle
  path: string
  dir: string
}

export interface EventJson {
  timestamp: string
  city: string
  est_lat: string
  est_lon: string
  reason: string
  camera: string
}

export interface TauriFile {
  name: string
  path: string
}
