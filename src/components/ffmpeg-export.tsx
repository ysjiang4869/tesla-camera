import React, { useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Field,
  Radio,
  RadioGroup,
  useId,
  Toaster,
  useToastController,
  Toast,
  ToastTitle,
  ToastBody,
  makeStyles,
  tokens,
  Checkbox,
} from '@fluentui/react-components'
import { Icons } from './icons'
import { topbarStyles } from './topbar-styles'
import { type Video, type ExportTaskType, ExportStatusEnum } from '../model'
import { open } from '@tauri-apps/plugin-dialog'
import { Command } from '@tauri-apps/plugin-shell'
import { getName } from '@tauri-apps/api/app'
import { resolveResource, tempDir } from '@tauri-apps/api/path'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import ExportTask from './export-task'
import { durationToMs } from '../tool'
import { buildDashcamSrt, escapeFfmpegPath } from '../dashcam'

interface FfmpegExportProps {
  video: Video
}

type CameraType = 'f' | 'b' | 'l' | 'r'

const useStyles = makeStyles({
  root: {},
  currentExportDir: {
    color: tokens.colorNeutralForeground3,
  },
})

const getFile = (camera: CameraType, video: Video) => {
  switch (camera) {
    case 'f':
      return {
        name: video.src_f_name,
        path: video.src_f_path,
      }
    case 'l':
      return {
        name: video.src_l_name,
        path: video.src_l_path,
      }
    case 'r':
      return {
        name: video.src_r_name,
        path: video.src_r_path,
      }
    case 'b':
      return {
        name: video.src_b_name,
        path: video.src_b_path,
      }
    default:
      return {
        name: video.src_f_name,
        path: video.src_f_path,
      }
  }
}

const doTask = async (
  camera: CameraType,
  video: Video,
  exportDir: string,
  includeDashcam: boolean,
  log: (arg: {
    path: string
    name: string
    exportDir: string
    status: number
    log: string
  }) => void,
) => {
  const { path: filePath, name: fileName } = getFile(camera, video)
  try {
    // 打包的 ffmpeg(tessus 构建)在终端用户机器上找不到 fontconfig 默认配置,
    // 缺省字体会渲染成「豆腐块」乱码;显式指定随应用打包的字体即可正常写入时间。
    const fontPath = await resolveResource('fonts/DejaVuSans.ttf')
    const filters = [
      `drawtext=fontfile='${escapeFfmpegPath(fontPath)}':fontsize=52:fontcolor=white:box=1:boxborderw=10:x=(w-text_w)/2:y=10:boxcolor=black@0.4:text='%{pts\\:localtime\\:${video.time / 1000}}'`,
    ]
    if (includeDashcam && video.dashcam?.length) {
      const srt = buildDashcamSrt(video.dashcam)
      if (srt) {
        const srtPath = `${await tempDir()}/tesla-camera-dashcam-${video.time}-${camera}.srt`
        await writeTextFile(srtPath, srt)
        // 与顶部时间 drawtext(box=black@0.4)统一风格:白字 + 半透明黑盒、贴底居中。
        // 注意 ASS BorderStyle=3 的盒子色取自 OutlineColour(非 BackColour),
        // 故盒色设为 &H99000000(alpha 0x99≈0.4 不透明,等价 black@0.4);
        // Shadow=0 去阴影,Outline 作为盒内边距让整行信息在底部一行舒展展示。
        filters.push(`subtitles='${escapeFfmpegPath(srtPath)}':force_style='FontSize=8,PrimaryColour=&H00FFFFFF,OutlineColour=&H99000000,BorderStyle=3,Outline=8,Shadow=0,Alignment=2,MarginV=10'`)
      }
    }
    const command = Command.sidecar(
      'binaries/ffmpeg',
      [
        '-y',
        '-i', filePath,
        '-progress', '-', '-nostats',
        '-vf', filters.join(','),
        `${exportDir}/${fileName}`,
      ],
    )
    command.on('close', data => {
      // 之前无视退出码一律标「成功」;非零退出(如无法写入输出目录)其实是失败
      const ok = data?.code === 0
      console.log('[export] ffmpeg closed', data)
      log({
        name: fileName,
        path: filePath,
        exportDir,
        status: ok ? ExportStatusEnum.导出成功 : ExportStatusEnum.导出失败,
        log: ok ? 'success' : `ffmpeg 非零退出 code=${data?.code} signal=${data?.signal}`,
      })
    })
    command.on('error', error => {
      console.error('[export] ffmpeg error event:', error)
      log({
        name: fileName,
        path: filePath,
        exportDir,
        status: ExportStatusEnum.导出失败,
        log: `进程错误: ${error}`,
      })
    })
    command.stdout.on('data', line => {
      log({
        name: fileName,
        path: filePath,
        exportDir,
        status: ExportStatusEnum.进行中,
        log: line,
      })
    })
    command.stderr.on('data', line => {
      log({
        name: fileName,
        path: filePath,
        exportDir,
        status: ExportStatusEnum.进行中,
        log: line,
      })
    })
    const child = await command.spawn()
    log({
      name: fileName,
      path: filePath,
      exportDir,
      status: ExportStatusEnum.进行中,
      log: `pid: ${child.pid}`,
    })
  } catch (error) {
    // sidecar 启动失败(二进制缺失/权限/路径等)不会触发上面的事件回调,
    // 这里兜底走「导出失败」分支:push 失败任务到列表 + error toast + 通知,避免静默无反应
    console.error('[export] spawn threw:', error)
    log({
      name: fileName,
      path: filePath,
      exportDir,
      status: ExportStatusEnum.导出失败,
      log: `导出启动失败: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

const FfmpegExport: React.FC<FfmpegExportProps> = (props) => {
  const [dialogIsOpen, setDialogIsOpen] = useState(false)
  const [tasks, setTasks] = useState<ExportTaskType[]>([])
  const tempTasks = useRef(tasks)
  const [exportDir, setExportDir] = useState(localStorage.getItem('exportDir') ?? '')
  const [camera, setCamera] = useState<CameraType>(localStorage.getItem('camera') as CameraType ?? 'f')
  const [includeDashcam, setIncludeDashcam] = useState<boolean>(localStorage.getItem('includeDashcam') === '1')
  const toasterId = useId('toaster')
  const { dispatchToast } = useToastController(toasterId)
  const styles = useStyles()
  const selectExportDir = async () => {
    const exportDir = await open({
      directory: true,
      multiple: false,
      recursive: true,
    })
    if (!exportDir) {
      return
    }
    localStorage.setItem('exportDir', exportDir as string)
    setExportDir(exportDir as string)
  }
  const onConfirm = async () => {
    if (!exportDir) {
      dispatchToast(
        <Toast>
          <ToastTitle>
            提示
          </ToastTitle>
          <ToastBody>
            请选择导出文件目录
          </ToastBody>
        </Toast>,
        { intent: 'warning' },
      )
      return
    }
    const { path: filePath } = getFile(camera, props.video)
    const existsTask = tasks.find(item => item.path === filePath)
    if (existsTask) {
      dispatchToast(
        <Toast>
          <ToastTitle>
            提示
          </ToastTitle>
          <ToastBody>
            导出任务已存在
          </ToastBody>
        </Toast>,
        { intent: 'warning' },
      )
      return
    }
    setDialogIsOpen(false)
    const afterNoticePermission = await isPermissionGranted()
    if (!afterNoticePermission) {
      requestPermission()
    }
    doTask(
      camera,
      props.video,
      exportDir,
      includeDashcam,
      async ({
        path, status, log, exportDir, name,
      }) => {
        const temp = [...tempTasks.current]
        const existsIndex = temp.findIndex(item => item.path === path)
        const lineLog = log.trim()
        let duration
        let progress
        if (lineLog.startsWith('Duration')) {
          const durationStr = lineLog.match(/[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?,/)?.[0]?.slice(0, -1)
          if (durationStr) {
            duration = durationToMs(durationStr)
          }
        }
        if (lineLog.startsWith('out_time_ms')) {
          const progressStr = lineLog.slice(lineLog.indexOf('=') + 1)
          if (progressStr) {
            progress = Math.max(0, +progressStr / 1000)
          }
        }
        if (existsIndex > -1) {
          temp.splice(existsIndex, 1, {
            ...temp[existsIndex],
            status,
            duration: duration ?? temp[existsIndex].duration,
            progress: progress ?? temp[existsIndex].progress,
            log: [...temp[existsIndex].log, log],
          })
        } else {
          temp.push({
            name,
            path: filePath,
            exportDir,
            status,
            duration: duration ?? 1,
            progress: 0,
            log: [log],
          })
        }
        if (status === ExportStatusEnum.导出成功) {
          dispatchToast(
            <Toast>
              <ToastTitle>
                提示
              </ToastTitle>
              <ToastBody>
                {exportDir}/{name} 导出成功
              </ToastBody>
            </Toast>,
            { intent: 'success' },
          )
          if (await isPermissionGranted()) {
            const appName = await getName()
            const iconPath = await resolveResource('icons/128x128.png')
            sendNotification({
              title: `${appName}导出通知`,
              body: `文件导出成功: ${exportDir}`,
              icon: iconPath,
            })
          }
        }
        if (status === ExportStatusEnum.导出失败) {
          dispatchToast(
            <Toast>
              <ToastTitle>
                提示
              </ToastTitle>
              <ToastBody>
                {name} 导出失败: {log}
              </ToastBody>
            </Toast>,
            { intent: 'error' },
          )
          if (await isPermissionGranted()) {
            const appName = await getName()
            const iconPath = await resolveResource('icons/128x128.png')
            sendNotification({
              title: `${appName}导出通知`,
              body: `文件导出失败: ${name}\n${log}`,
              icon: iconPath,
            })
          }
        }
        tempTasks.current = temp
        setTasks(temp)
      },
    ).catch((error) => {
      dispatchToast(
        <Toast>
          <ToastTitle>
            提示
          </ToastTitle>
          <ToastBody>
            导出启动失败: {error instanceof Error ? error.message : String(error)}
          </ToastBody>
        </Toast>,
        { intent: 'error' },
      )
    })
    dispatchToast(
      <Toast>
        <ToastTitle>
          提示
        </ToastTitle>
        <ToastBody>
          导出任务已开始，请耐心等待
        </ToastBody>
      </Toast>,
      { intent: 'info' },
    )
  }
  return (
    <>
      {
        props.video ? (
          <>
            <Dialog
              modalType="modal"
              open={dialogIsOpen}
              onOpenChange={(_, data) => {
                if (data.type === 'backdropClick') {
                  setDialogIsOpen(data.open)
                }
              }}
            >
              <DialogTrigger disableButtonEnhancement>
                <button
                  style={topbarStyles.btn}
                  title="导出带有时间码的视频"
                  type="button"
                  onClick={() => setDialogIsOpen(true)}
                >
                  <Icons.Export size={14} />
                  导出片段
                </button>
              </DialogTrigger>
              <DialogSurface>
                <DialogBody>
                  <DialogTitle>导出视频</DialogTitle>
                  <DialogContent>
                    <Field label="相机视角">
                      <RadioGroup
                        layout="horizontal"
                        value={camera}
                        onChange={(_, data) => setCamera(data.value as CameraType)}
                      >
                        <Radio label="前" value="f" />
                        <Radio label="后" value="b" />
                        <Radio label="左" value="l" />
                        <Radio label="右" value="r" />
                      </RadioGroup>
                    </Field>
                    <Field label="导出文件目录">
                      <div className={styles.currentExportDir}>
                        当前选择：{exportDir}
                        <Button
                          appearance="transparent"
                          size="small"
                          onClick={() => selectExportDir()}
                        >选择目录
                        </Button>
                      </div>
                    </Field>
                    <Field label="叠加信息">
                      <Checkbox
                        checked={includeDashcam}
                        disabled={!props.video.dashcam?.length}
                        label={props.video.dashcam?.length ? '包含 Dashcam 遥测信息（车速/方向盘/位置等）' : '未发现Dashcam信息'}
                        onChange={(_, data) => {
                          setIncludeDashcam(!!data.checked)
                          localStorage.setItem('includeDashcam', data.checked ? '1' : '0')
                        }}
                      />
                    </Field>
                  </DialogContent>
                  <DialogActions>
                    <DialogTrigger disableButtonEnhancement>
                      <Button
                        appearance="primary"
                        onClick={() => onConfirm()}
                      >确认导出
                      </Button>
                    </DialogTrigger>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
            <Toaster toasterId={toasterId} />
          </>
        ) : null
      }
      {tasks.length > 0 ? <ExportTask tasks={tasks} /> : null}
    </>
  )
}

export default FfmpegExport
