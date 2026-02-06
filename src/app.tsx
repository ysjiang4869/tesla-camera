import { useState, useEffect } from 'react'
import cln from 'classnames'
import dayjs from 'dayjs'
import {
  makeStyles,
  shorthands,
  Tab,
  TabList,
  Divider,
  tokens,
  Tooltip,
  Button,
  Caption1Stronger,
  Badge,
} from '@fluentui/react-components'
import {
  Record24Regular, Code24Regular, BookQuestionMark24Regular,
} from '@fluentui/react-icons'
import Player from './components/player'
import DirectoryAccess from './components/directory-access'
import FfmpegTerminal from './components/ffmpeg-terminal'
import FfmpegExport from './components/ffmpeg-export'
import FsSystem from './components/fs-system'
import CheckUpdate from './components/check-update'
import {
  TypeEnum,
  type ModelState,
  type OriginVideo,
  type OriginVideoGroup,
  type Video,
  type VideoGroup,
} from './model'
import { parseDashcamFromMp4 } from './dashcam'

const useStyles = makeStyles({
  root: {
    display: 'flex',
  },
  aside: {
    width: '330px',
    height: '100vh',
    backgroundColor: tokens.colorNeutralStroke3,
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
  },
  empty: {
    textAlign: 'center',
  },
  tabWrap: {
    alignItems: 'flex-start',
    display: 'flex',
    justifyContent: 'center',
    ...shorthands.padding('10px'),
    rowGap: '20px',
    flexShrink: 0,
  },
  menuWrap: {
    ...shorthands.padding('20px'),
    overflowY: 'auto',
    flexGrow: 1,
    display: 'flex',
    rowGap: '14px',
    flexDirection: 'column',
  },
  eventTag: {
    flexGrow: '1',
    textAlign: 'right',
  },
  menuItem: {
    ...shorthands.padding('8px'),
    ...shorthands.borderRadius('4px'),
    ...shorthands.transition('all', '120ms'),
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    alignItems: 'stretch',
    cursor: 'pointer',
    columnGap: '12px',
    color: tokens.colorNeutralForeground1,
    ':hover': {
      color: tokens.colorCompoundBrandStrokePressed,
    },
  },
  menuItemIsActive: {
    color: tokens.colorPaletteRedBorderActive,
    ':hover': {
      color: tokens.colorPaletteRedBorderActive,
    },
  },
  menuThumbWrap: {
    width: '112px',
    height: '72px',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius('4px'),
    ...shorthands.overflow('hidden'),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  menuInfo: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    rowGap: '2px',
    flexGrow: 1,
  },
  menuTitle: {
    fontWeight: 600,
    lineHeight: '20px',
  },
  menuMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
    lineHeight: '16px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  content: {
    height: '100vh',
    ...shorthands.overflow('hidden', 'auto'),
    flexGrow: 1,
    backgroundColor: tokens.colorSubtleBackgroundHover,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    ...shorthands.padding('20px'),
  },
  headerLeft: {
    ...shorthands.gap('10px'),
    display: 'flex',
  },
  headerRight: {
    ...shorthands.gap('10px'),
    display: 'flex',
    alignItems: 'center',
  },
  link: {
    color: 'inherit',
    '&:active': {
      color: 'inherit',
    },
  },
  player: {
    flexGrow: 1,
    minHeight: '1px',
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
  },
})

const TYPE_LABEL_MAP: Record<TypeEnum, string> = {
  [TypeEnum.所有]: '所有',
  [TypeEnum.事件]: '事件',
  [TypeEnum.哨兵]: '哨兵',
  [TypeEnum.行车记录仪]: '记录仪',
}

function revokeGroupUrls(group?: VideoGroup) {
  if (!group) {
    return
  }
  group.videos.forEach((item) => {
    URL.revokeObjectURL(item.src_f)
    URL.revokeObjectURL(item.src_b)
    URL.revokeObjectURL(item.src_l)
    URL.revokeObjectURL(item.src_r)
  })
}

const tabs = [
  {
    name: '所有',
    value: TypeEnum.所有,
  },
  {
    name: '事件',
    value: TypeEnum.事件,
  },
  {
    name: '哨兵',
    value: TypeEnum.哨兵,
  },
  {
    name: '记录仪',
    value: TypeEnum.行车记录仪,
  },
]

function App() {
  const styles = useStyles()
  const [filterType, setFilterType] = useState(TypeEnum.所有)
  const [state, setState] = useState<ModelState>({
    type: TypeEnum.所有,
    list: [],
    events: [],
  })
  useEffect(() => {
    document.onkeydown = (e: KeyboardEvent) => {
      if (e.code == 'Space') {
        e.preventDefault()
      }
    }
    return () => {
      document.onkeydown = null
    }
  }, [])
  useEffect(() => () => {
    revokeGroupUrls(state.currentGroup)
  }, [state.currentGroup])
  function onFileSystemAccess(groups: OriginVideoGroup[]) {
    setState((prev) => {
      const currentGroupId = prev.currentGroup?.id
      const nextMeta = currentGroupId ? groups.find(item => item.id === currentGroupId) : undefined
      if (!nextMeta || !prev.currentGroup) {
        return {
          ...prev,
          list: groups,
          current: undefined,
          currentGroup: undefined,
        }
      }
      const nextCurrentGroup: VideoGroup = {
        ...prev.currentGroup,
        title: nextMeta.title,
        time: nextMeta.time,
        type: nextMeta.type,
        dir: nextMeta.dir,
        event: nextMeta.event,
        city: nextMeta.city,
        latitude: nextMeta.latitude,
        longitude: nextMeta.longitude,
        reason: nextMeta.reason,
        thumbnail: nextMeta.thumbnail,
      }
      const nextCurrent = prev.current
        ? nextCurrentGroup.videos.find(video => video.time === prev.current?.time) ?? prev.current
        : nextCurrentGroup.videos[0]
      return {
        ...prev,
        list: groups,
        currentGroup: nextCurrentGroup,
        current: nextCurrent,
      }
    })
  }

  async function loadVideo(origin: OriginVideo): Promise<Video> {
    const [
      src_f_file,
      src_b_file,
      src_l_file,
      src_r_file,
    ] = [
      await origin.src_f.get(),
      await origin.src_b.get(),
      await origin.src_l.get(),
      await origin.src_r.get(),
    ]
    if (!origin.dashcam?.length && origin.src_f.getBuffer) {
      try {
        const frontBuffer = await origin.src_f.getBuffer()
        origin.dashcam = parseDashcamFromMp4(frontBuffer)
      } catch {
      // ignore malformed telemetry payloads
      }
    }
    return {
      ...origin,
      src_f: src_f_file.url,
      src_f_name: src_f_file.name,
      src_f_path: origin.src_f.path,
      src_b: src_b_file.url,
      src_b_name: src_b_file.name,
      src_b_path: origin.src_b.path,
      src_l: src_l_file.url,
      src_l_name: src_l_file.name,
      src_l_path: origin.src_l.path,
      src_r: src_r_file.url,
      src_r_name: src_r_file.name,
      src_r_path: origin.src_r.path,
      dashcam: origin.dashcam,
    }
  }

  async function onSelectGroup(groupId: string) {
    const originGroup = state.list.find(item => item.id === groupId)
    if (!originGroup) {
      return
    }
    revokeGroupUrls(state.currentGroup)
    const videos = await Promise.all(originGroup.clips.map(item => loadVideo(item)))
    const currentGroup: VideoGroup = {
      id: originGroup.id,
      title: originGroup.title,
      time: originGroup.time,
      type: originGroup.type,
      dir: originGroup.dir,
      videos,
      event: originGroup.event,
      city: originGroup.city,
      latitude: originGroup.latitude,
      longitude: originGroup.longitude,
      reason: originGroup.reason,
      thumbnail: originGroup.thumbnail,
    }
    setState(prev => ({
      ...prev,
      currentGroup,
      current: videos[0],
    }))
  }

  function onCurrentVideoChange(video: Video) {
    setState(prev => ({
      ...prev,
      current: video,
    }))
  }
  const groupList = state.list
    .filter(({ type }) => type === filterType || filterType === TypeEnum.所有)
    .sort((a, b) => b.time - a.time)
  return (
    <>
      <div className={styles.root}>
        <div className={styles.aside}>
          <div>
            <div className={styles.tabWrap}>
              <TabList
                selectedValue={filterType}
                onTabSelect={(_, data) => setFilterType(data.value as TypeEnum)}
              >
                {
                  tabs.map(({ name, value }) => (
                    <Tab key={value} value={value}>{name}</Tab>
                  ))
                }
              </TabList>
            </div>
            <Divider />
          </div>
          <div className={styles.menuWrap}>
            {
              groupList.map((item) => (
                <div
                  className={cln(styles.menuItem, { [styles.menuItemIsActive]: item.id === state.currentGroup?.id })}
                  key={item.id}
                  onClick={() => onSelectGroup(item.id)}
                  onKeyDown={(e) => {
                    e.preventDefault()
                  }}
                  onKeyUp={(e) => {
                    e.preventDefault()
                  }}
                >
                  <div className={styles.menuThumbWrap}>
                    {item.thumbnail ? <img alt={item.title} className={styles.menuThumb} loading="lazy" src={item.thumbnail} /> : <Record24Regular />}
                  </div>
                  <div className={styles.menuInfo}>
                    <div className={styles.menuTitle}>{item.title}</div>
                    <div className={styles.menuMeta}>{TYPE_LABEL_MAP[item.type]} | {item.city ?? '未知位置'}</div>
                    <div className={styles.menuMeta}>
                      事件时间: {item.event ? dayjs(item.event).format('YYYY-MM-DD HH:mm') : '-'}
                    </div>
                    <div className={styles.menuMeta}>
                      片段数: {item.clips.length}
                      {item.latitude !== undefined && item.longitude !== undefined ? ` | ${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}` : ''}
                    </div>
                  </div>
                  <div className={styles.eventTag}>
                    {item.event ? <Badge color="danger" size="extra-small" /> : null}
                  </div>
                </div>
              ))
            }
            {!groupList.length && <div className={styles.empty}>暂无数据</div>}
          </div>
        </div>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              {window.__TAURI_IPC__
                ? <FsSystem onAccess={onFileSystemAccess} />
                : <DirectoryAccess onAccess={onFileSystemAccess} />}
              {window.__TAURI_IPC__ && state.current
                ? <FfmpegExport video={state.current} />
                : <FfmpegTerminal video={state.current} />}
            </div>
            <div className={styles.headerRight}>
              <CheckUpdate />
              <Tooltip
                content={<>查看源代码 (本项目<Caption1Stronger>不会上传</Caption1Stronger>您的隐私视频，并且接受公开的代码审查)</>}
                relationship="label"
              >
                <Button
                  icon={
                    <a
                      className={styles.link}
                      href="https://github.com/Mario34/tesla-camera"
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Code24Regular />
                    </a>
                  }
                />
              </Tooltip>
              <Tooltip content={<>问题反馈</>} relationship="label">
                <Button
                  icon={
                    <a
                      className={styles.link}
                      href="https://github.com/Mario34/tesla-camera/issues/new?assignees=Mario34&labels=&template=%E6%84%8F%E8%A7%81%E6%88%96%E5%8F%8D%E9%A6%88.md&title=%E6%84%8F%E8%A7%81%E6%88%96%E5%8F%8D%E9%A6%88"
                      rel="noreferrer"
                      target="_blank"
                    >
                      <BookQuestionMark24Regular />
                    </a>
                  }
                />
              </Tooltip>
            </div>
          </div>
          <div className={styles.player}>
            <Player key={state.currentGroup?.id} videos={state.currentGroup?.videos} onVideoChange={onCurrentVideoChange} />
          </div>
        </div>
      </div>
    </>
  )
}

export default App
