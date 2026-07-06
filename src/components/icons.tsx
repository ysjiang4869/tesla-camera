import React from 'react'

interface IconProps {
  size?: number
  fill?: string
  stroke?: number
  style?: React.CSSProperties
}

const Ico: React.FC<IconProps & { d?: string; children?: React.ReactNode }> = ({
  d, size = 18, fill, stroke = 1.5, children, style,
}) => (
  <svg
    fill={fill || 'none'}
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={stroke}
    style={style}
    viewBox="0 0 24 24"
    width={size}
  >
    {d ? <path d={d} /> : children}
  </svg>
)

export const Icons = {
  Folder: (p: IconProps) => <Ico {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  Export: (p: IconProps) => <Ico {...p}><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></Ico>,
  Eye: (p: IconProps) => <Ico {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Ico>,
  EyeOff: (p: IconProps) => <Ico {...p}><path d="m3 3 18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4" /><path d="M6.6 6.6A17 17 0 0 0 2 11s3.5 7 10 7c1.6 0 3-.3 4.3-.8" /></Ico>,
  Code: (p: IconProps) => <Ico {...p}><path d="m8 6-6 6 6 6" /><path d="m16 6 6 6-6 6" /></Ico>,
  Help: (p: IconProps) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.7c-.6.6-1.4.9-1.9 1.4-.3.3-.5.7-.5 1.2" /><circle cx="12" cy="17" fill="currentColor" r="0.6" /></Ico>,
  Sync: (p: IconProps) => <Ico {...p}><path d="M21 12a9 9 0 0 0-15.5-6.4L3 8" /><path d="M3 4v4h4" /><path d="M3 12a9 9 0 0 0 15.5 6.4L21 16" /><path d="M21 20v-4h-4" /></Ico>,
  Search: (p: IconProps) => <Ico {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Ico>,
  Play: (p: IconProps) => <Ico {...p} fill="currentColor" stroke={0}><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></Ico>,
  Pause: (p: IconProps) => <Ico {...p} fill="currentColor" stroke={0}><rect height="14" rx="1.2" width="4" x="6" y="5" /><rect height="14" rx="1.2" width="4" x="14" y="5" /></Ico>,
  SkipBack: (p: IconProps) => <Ico {...p}><path d="m11 19-9-7 9-7v14Z" /><path d="M22 5v14" /></Ico>,
  SkipForward: (p: IconProps) => <Ico {...p}><path d="m13 5 9 7-9 7V5Z" /><path d="M2 5v14" /></Ico>,
  Back10: (p: IconProps) => <Ico {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></Ico>,
  Fwd10: (p: IconProps) => <Ico {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></Ico>,
  Volume: (p: IconProps) => <Ico {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M16 9a4 4 0 0 1 0 6" /></Ico>,
  Fullscreen: (p: IconProps) => <Ico {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4" /><path d="M20 9V5a1 1 0 0 0-1-1h-4" /><path d="M4 15v4a1 1 0 0 0 1 1h4" /><path d="M20 15v4a1 1 0 0 1-1 1h-4" /></Ico>,
  Camera: (p: IconProps) => <Ico {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /><circle cx="12" cy="13" r="4" /></Ico>,
  Map: (p: IconProps) => <Ico {...p}><path d="M3 6 9 4l6 2 6-2v14l-6 2-6-2-6 2V6Z" /><path d="M9 4v16" /><path d="M15 6v16" /></Ico>,
  Grid: (p: IconProps) => <Ico {...p}><rect height="7" rx="1" width="7" x="3" y="3" /><rect height="7" rx="1" width="7" x="14" y="3" /><rect height="7" rx="1" width="7" x="3" y="14" /><rect height="7" rx="1" width="7" x="14" y="14" /></Ico>,
  Filter: (p: IconProps) => <Ico {...p}><path d="M3 5h18l-7 9v5l-4 2v-7L3 5Z" /></Ico>,
  Wheel: (p: IconProps) => <Ico {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v6" /><path d="m4.5 8 5.2 3" /><path d="m19.5 8-5.2 3" /></Ico>,
  ArrowLeft: (p: IconProps) => <Ico {...p}><path d="M19 12H5" /><path d="m12 5-7 7 7 7" /></Ico>,
  ArrowRight: (p: IconProps) => <Ico {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Ico>,
  Battery: (p: IconProps) => <Ico {...p}><rect height="10" rx="2" width="18" x="2" y="7" /><path d="M22 11v2" /></Ico>,
  Tasks: (p: IconProps) => <Ico {...p}><rect height="18" rx="2.5" width="18" x="3" y="3" /><path d="m7.5 12 2.5 2.5L16.5 8" /></Ico>,
}

export default Icons
