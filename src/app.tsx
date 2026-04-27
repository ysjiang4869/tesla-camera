import { useState, useEffect, useMemo } from 'react'
import dayjs from 'dayjs'
import Player from './components/player'
import DirectoryAccess from './components/directory-access'
import FfmpegTerminal from './components/ffmpeg-terminal'
import FfmpegExport from './components/ffmpeg-export'
import FsSystem from './components/fs-system'
import CheckUpdate from './components/check-update'
import { Icons } from './components/icons'
import {
  TypeEnum,
  type ModelState,
  type OriginVideo,
  type OriginVideoGroup,
  type Video,
  type VideoGroup,
} from './model'
import { parseDashcamFromMp4 } from './dashcam'

// ─── Sidebar styles ───────────────────────────────────────────────────────────

const sidebarStyles = {
  aside: {
    width: 300,
    flexShrink: 0,
    height: '100vh',
    background: 'var(--bg-1)',
    borderRight: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  brand: {
    padding: '14px 16px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderBottom: '1px solid var(--line-soft)',
    flexShrink: 0,
  },
  brandLogo: {
    width: 28, height: 28,
    borderRadius: 8,
    background: 'linear-gradient(135deg, var(--accent), oklch(0.62 0.13 220))',
    display: 'grid', placeItems: 'center' as const,
    color: 'var(--bg-0)',
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: '-0.5px',
    flexShrink: 0,
  },
  brandText: { display: 'flex', flexDirection: 'column' as const, lineHeight: 1.15 },
  brandTitle: { fontSize: 13, fontWeight: 600, color: 'var(--fg-0)' },
  brandSub: { fontSize: 11, color: 'var(--fg-2)', letterSpacing: '0.4px', textTransform: 'uppercase' as const },

  searchRow: {
    padding: '10px 12px',
    display: 'flex', gap: 8, alignItems: 'center',
    flexShrink: 0,
  },
  searchBox: {
    flex: 1,
    display: 'flex', alignItems: 'center', gap: 8,
    height: 32,
    padding: '0 10px',
    background: 'var(--bg-0)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    color: 'var(--fg-2)',
  },
  searchInput: {
    background: 'transparent', border: 0, outline: 'none',
    color: 'var(--fg-0)', fontSize: 13, flex: 1, fontFamily: 'inherit',
  },

  tabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    padding: '4px 12px 12px',
    gap: 4,
    flexShrink: 0,
  },
  tab: {
    height: 30,
    padding: '0 4px',
    border: 0,
    background: 'transparent',
    color: 'var(--fg-2)',
    cursor: 'pointer',
    borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    fontSize: 12, fontWeight: 500,
    transition: 'background 120ms, color 120ms',
  },
  tabActive: {
    background: 'var(--bg-2)',
    color: 'var(--fg-0)',
    boxShadow: 'inset 0 0 0 1px var(--line)',
  },
  tabCount: {
    fontSize: 10,
    color: 'var(--fg-3)',
    fontFamily: "'JetBrains Mono', monospace",
    fontVariantNumeric: 'tabular-nums' as const,
  },

  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0 8px 12px',
    display: 'flex', flexDirection: 'column' as const, gap: 4,
  },
  empty: {
    padding: 32,
    textAlign: 'center' as const,
    color: 'var(--fg-3)',
    fontSize: 13,
  },

  card: {
    position: 'relative' as const,
    display: 'grid',
    gridTemplateColumns: '72px 1fr',
    gap: 10,
    padding: 8,
    borderRadius: 10,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--fg-1)',
    cursor: 'pointer',
    transition: 'background 120ms, border-color 120ms',
    textAlign: 'left' as const,
    width: '100%',
  },
  cardHover: { background: 'var(--bg-2)' },
  cardActive: {
    background: 'var(--bg-2)',
    borderColor: 'oklch(0.78 0.13 220 / 0.4)',
    boxShadow: '0 0 0 1px oklch(0.78 0.13 220 / 0.2), inset 0 0 0 1px oklch(0.78 0.13 220 / 0.15)',
  },
  thumb: {
    width: 72, height: 48,
    borderRadius: 6,
    background: 'var(--bg-3)',
    backgroundSize: 'cover' as const,
    backgroundPosition: 'center' as const,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    border: '1px solid var(--line-soft)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { display: 'flex', flexDirection: 'column' as const, gap: 2, minWidth: 0 },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--fg-0)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  cardTitleActive: { color: 'oklch(0.85 0.10 220)' },
  cardTime: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: 'var(--fg-2)',
    fontVariantNumeric: 'tabular-nums' as const,
    flexShrink: 0,
  },
  cardMetaRow: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11,
    color: 'var(--fg-2)',
    overflow: 'hidden',
  },
  pill: {
    display: 'inline-flex', alignItems: 'center',
    padding: '1px 5px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.2px',
    textTransform: 'uppercase' as const,
    flexShrink: 0,
  },
  cardMeta: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10.5,
    color: 'var(--fg-3)',
    fontFamily: "'JetBrains Mono', monospace",
    fontVariantNumeric: 'tabular-nums' as const,
  },
  cardDot: { width: 2, height: 2, borderRadius: 99, background: 'var(--fg-3)', flexShrink: 0 },
  eventDotInline: {
    width: 6, height: 6,
    borderRadius: 99,
    background: 'var(--danger)',
    boxShadow: '0 0 0 3px oklch(0.68 0.21 25 / 0.18)',
    flexShrink: 0,
  },
}

const TYPE_PILL_STYLE: Record<TypeEnum, { label: string; bg: string; color: string }> = {
  [TypeEnum.所有]: { label: '所有', bg: 'var(--bg-2)', color: 'var(--fg-1)' },
  [TypeEnum.事件]: { label: '事件', bg: 'var(--danger-soft)', color: 'oklch(0.78 0.18 25)' },
  [TypeEnum.哨兵]: { label: '哨兵', bg: 'oklch(0.74 0.16 280 / 0.16)', color: 'oklch(0.82 0.12 280)' },
  [TypeEnum.行车记录仪]: { label: '记录仪', bg: 'oklch(0.74 0.16 150 / 0.16)', color: 'oklch(0.82 0.12 150)' },
}

const TABS = [
  { label: '所有', value: TypeEnum.所有 },
  { label: '事件', value: TypeEnum.事件 },
  { label: '哨兵', value: TypeEnum.哨兵 },
  { label: '记录仪', value: TypeEnum.行车记录仪 },
]

// ─── TopBar styles ────────────────────────────────────────────────────────────

const topbarStyles = {
  bar: {
    height: 52,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: '1px solid var(--line)',
    background: 'var(--bg-1)',
    gap: 12,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 34,
    padding: 3,
    background: 'var(--bg-0)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    flexShrink: 0,
  },
  btn: {
    height: 28,
    padding: '0 10px',
    border: 0,
    background: 'transparent',
    color: 'var(--fg-1)',
    borderRadius: 7,
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    transition: 'background 120ms, color 120ms',
  },
  btnActive: {
    background: 'var(--accent-soft)',
    color: 'oklch(0.88 0.10 220)',
    boxShadow: 'inset 0 0 0 1px oklch(0.78 0.13 220 / 0.25)',
  },
  iconOnly: {
    width: 28, height: 28,
    padding: 0,
    display: 'grid', placeItems: 'center' as const,
  },
  divider: { width: 1, height: 16, background: 'var(--line)', margin: '0 2px', flexShrink: 0 },
  status: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 11,
    color: 'var(--fg-2)',
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 99,
    background: 'var(--success)',
    boxShadow: '0 0 0 3px oklch(0.74 0.16 150 / 0.18)',
    flexShrink: 0,
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function revokeGroupUrls(group?: VideoGroup) {
  if (!group) return
  group.videos.forEach((item) => {
    URL.revokeObjectURL(item.src_f)
    URL.revokeObjectURL(item.src_b)
    URL.revokeObjectURL(item.src_l)
    URL.revokeObjectURL(item.src_r)
  })
}

// ─── ClipCard ─────────────────────────────────────────────────────────────────

function ClipCard({ item, active, onSelect }: {
  item: OriginVideoGroup
  active: boolean
  onSelect: (id: string) => void
}) {
  const [hover, setHover] = useState(false)
  const pill = TYPE_PILL_STYLE[item.type]
  const cardStyle = {
    ...sidebarStyles.card,
    ...(hover && !active ? sidebarStyles.cardHover : {}),
    ...(active ? sidebarStyles.cardActive : {}),
  }

  return (
    <button
      style={cardStyle}
      type="button"
      onClick={() => onSelect(item.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
        ...sidebarStyles.thumb,
        ...(item.thumbnail ? { backgroundImage: `url(${item.thumbnail})` } : {}),
        }}
      >
        {!item.thumbnail && <span style={{ color: 'var(--fg-3)', fontSize: 20 }}>▶</span>}
      </div>
      <div style={sidebarStyles.cardBody}>
        <div style={sidebarStyles.cardHeader}>
          <span style={{ ...sidebarStyles.cardTitle, ...(active ? sidebarStyles.cardTitleActive : {}) }}>
            {dayjs(item.time).format('M月D日 H:mm')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={sidebarStyles.cardTime}>{dayjs(item.time).format('HH:mm')}</span>
            {item.event && <span style={sidebarStyles.eventDotInline} />}
          </div>
        </div>
        <div style={sidebarStyles.cardMetaRow}>
          <span style={{ ...sidebarStyles.pill, background: pill.bg, color: pill.color }}>{pill.label}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.city ?? '未知位置'}
          </span>
        </div>
        <div style={sidebarStyles.cardMeta}>
          <span>{item.clips.length} 段</span>
          {item.latitude !== undefined && item.longitude !== undefined && (
            <>
              <span style={sidebarStyles.cardDot} />
              <span>{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [filterType, setFilterType] = useState(TypeEnum.所有)
  const [showDashcamData, setShowDashcamData] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [state, setState] = useState<ModelState>({
    type: TypeEnum.所有,
    list: [],
    events: [],
  })

  useEffect(() => {
    document.onkeydown = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault()
    }
    return () => { document.onkeydown = null }
  }, [])

  useEffect(() => () => {
    revokeGroupUrls(state.currentGroup)
  }, [state.currentGroup])

  function onFileSystemAccess(groups: OriginVideoGroup[]) {
    setState((prev) => {
      const currentGroupId = prev.currentGroup?.id
      const nextMeta = currentGroupId ? groups.find(item => item.id === currentGroupId) : undefined
      if (!nextMeta || !prev.currentGroup) {
        return { ...prev, list: groups, current: undefined, currentGroup: undefined }
      }
      return { ...prev, list: groups }
    })
  }

  async function loadVideo(origin: OriginVideo): Promise<Video> {
    const [src_f_file, src_b_file, src_l_file, src_r_file] = await Promise.all([
      origin.src_f.get(),
      origin.src_b.get(),
      origin.src_l.get(),
      origin.src_r.get(),
    ])
    return {
      ...origin,
      src_f: src_f_file.url, src_f_name: src_f_file.name, src_f_path: origin.src_f.path,
      src_b: src_b_file.url, src_b_name: src_b_file.name, src_b_path: origin.src_b.path,
      src_l: src_l_file.url, src_l_name: src_l_file.name, src_l_path: origin.src_l.path,
      src_r: src_r_file.url, src_r_name: src_r_file.name, src_r_path: origin.src_r.path,
      dashcam: origin.dashcam,
    }
  }

  async function hydrateDashcam(groupId: string, originClips: OriginVideo[]) {
    for (const origin of originClips) {
      if (origin.dashcam?.length || !origin.src_f?.getBuffer) continue
      try {
        const frontBuffer = await origin.src_f.getBuffer()
        origin.dashcam = parseDashcamFromMp4(frontBuffer)
      } catch { /* ignore malformed telemetry */ }
      setState(prev => {
        if (prev.currentGroup?.id !== groupId) return prev
        const idx = prev.currentGroup.videos.findIndex(v => v.time === origin.time)
        if (idx < 0) return prev
        const updatedVideos = [...prev.currentGroup.videos]
        updatedVideos[idx] = { ...updatedVideos[idx], dashcam: origin.dashcam }
        return {
          ...prev,
          currentGroup: { ...prev.currentGroup, videos: updatedVideos },
          current: prev.current?.time === origin.time
            ? { ...prev.current, dashcam: origin.dashcam }
            : prev.current,
        }
      })
    }
  }

  async function onSelectGroup(groupId: string) {
    const originGroup = state.list.find(item => item.id === groupId)
    if (!originGroup) return
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
    setState(prev => ({ ...prev, currentGroup, current: videos[0] }))
    void hydrateDashcam(groupId, originGroup.clips)
  }

  function onCurrentVideoChange(video: Video) {
    setState(prev => ({ ...prev, current: video }))
  }

  const groupList = useMemo(() => {
    let list = state.list
      .filter(({ type }) => type === filterType || filterType === TypeEnum.所有)
      .sort((a, b) => b.time - a.time)
    if (searchText.trim()) {
      const s = searchText.toLowerCase().trim()
      list = list.filter(item =>
        dayjs(item.time).format('YYYY-MM-DD HH:mm').includes(s) ||
        (item.city ?? '').toLowerCase().includes(s)
      )
    }
    return list
  }, [state.list, filterType, searchText])

  const tabCounts = useMemo(() => ({
    [TypeEnum.所有]: state.list.length,
    [TypeEnum.事件]: state.list.filter(c => c.type === TypeEnum.事件).length,
    [TypeEnum.哨兵]: state.list.filter(c => c.type === TypeEnum.哨兵).length,
    [TypeEnum.行车记录仪]: state.list.filter(c => c.type === TypeEnum.行车记录仪).length,
  }), [state.list])

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-0)' }}>
      {/* ── Sidebar ────────────────────────────────────── */}
      <aside style={sidebarStyles.aside}>
        <div style={sidebarStyles.brand}>
          <div style={sidebarStyles.brandLogo}>D</div>
          <div style={sidebarStyles.brandText}>
            <span style={sidebarStyles.brandTitle}>Dashcam Viewer</span>
            <span style={sidebarStyles.brandSub}>Local · Private</span>
          </div>
        </div>

        <div style={sidebarStyles.searchRow}>
          <div style={sidebarStyles.searchBox}>
            <Icons.Search size={14} />
            <input
              placeholder="搜索日期、地点…"
              style={sidebarStyles.searchInput as React.CSSProperties}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div style={sidebarStyles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.value}
              style={{ ...sidebarStyles.tab, ...(filterType === t.value ? sidebarStyles.tabActive : {}) }}
              type="button"
              onClick={() => setFilterType(t.value)}
            >
              <span>{t.label}</span>
              <span style={sidebarStyles.tabCount}>{tabCounts[t.value]}</span>
            </button>
          ))}
        </div>

        <div style={sidebarStyles.list}>
          {groupList.length === 0 && (
            <div style={sidebarStyles.empty}>暂无符合条件的片段</div>
          )}
          {groupList.map((item) => (
            <ClipCard
              active={item.id === state.currentGroup?.id}
              item={item}
              key={item.id}
              onSelect={onSelectGroup}
            />
          ))}
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* TopBar */}
        <div style={topbarStyles.bar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={topbarStyles.group}>
              {window.__TAURI_IPC__
                ? <FsSystem onAccess={onFileSystemAccess} />
                : <DirectoryAccess onAccess={onFileSystemAccess} />}
              <div style={topbarStyles.divider} />
              {Boolean(window.__TAURI_IPC__) && state.current
                ? <FfmpegExport video={state.current} />
                : <FfmpegTerminal video={state.current} />}
            </div>
            {state.list.length > 0 && (
              <div className="topbar-status" style={topbarStyles.status}>
                <span style={topbarStyles.statusDot} />
                <span>已索引 {state.list.length} 段</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={topbarStyles.group}>
              <button
                style={{ ...topbarStyles.btn, ...topbarStyles.iconOnly, ...(showDashcamData ? topbarStyles.btnActive : {}) }}
                title={showDashcamData ? '隐藏遥测 HUD' : '显示遥测 HUD'}
                type="button"
                onClick={() => setShowDashcamData(v => !v)}
              >
                {showDashcamData ? <Icons.Eye size={14} /> : <Icons.EyeOff size={14} />}
              </button>
              {Boolean(window.__TAURI_IPC__) && <CheckUpdate />}
              <button
                style={{ ...topbarStyles.btn, ...topbarStyles.iconOnly }}
                title="查看源代码"
                type="button"
                onClick={() => window.open('https://github.com/Mario34/tesla-camera', '_blank')}
              >
                <Icons.Code size={14} />
              </button>
              <button
                style={{ ...topbarStyles.btn, ...topbarStyles.iconOnly }}
                title="问题反馈"
                type="button"
                onClick={() => window.open('https://github.com/Mario34/tesla-camera/issues', '_blank')}
              >
                <Icons.Help size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Player area */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Player
            currentGroup={state.currentGroup}
            eventTime={state.currentGroup?.event}
            key={state.currentGroup?.id}
            showDashcamData={showDashcamData}
            videos={state.currentGroup?.videos}
            onVideoChange={onCurrentVideoChange}
          />
        </div>
      </div>
    </div>
  )
}

export default App
