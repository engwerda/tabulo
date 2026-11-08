import type { ReactNode } from "react"

type IconProps = { readonly className?: string | undefined }

const Stroke = ({ className = "size-4", children }: IconProps & { children: ReactNode }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 ${className}`}
  >
    {children}
  </svg>
)

export const LogoMark = ({ className = "size-7" }: IconProps) => (
  <svg aria-hidden="true" viewBox="0 0 32 32" className={`shrink-0 ${className}`}>
    <defs>
      <linearGradient id="tabulo-logo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#818cf8" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" fill="url(#tabulo-logo)" />
    <rect x="7" y="8" width="5" height="16" rx="2" fill="#fff" />
    <rect x="13.5" y="8" width="5" height="10" rx="2" fill="#fff" fillOpacity="0.8" />
    <rect x="20" y="8" width="5" height="13" rx="2" fill="#fff" fillOpacity="0.6" />
  </svg>
)

export const GripIcon = ({ className = "size-4" }: IconProps) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    className={`shrink-0 ${className}`}
    fill="currentColor"
  >
    {[3.5, 8, 12.5].flatMap((y) =>
      [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" />),
    )}
  </svg>
)

export const SearchIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3.5 3.5" />
  </Stroke>
)
export const PlusIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M8 3v10M3 8h10" />
  </Stroke>
)
export const XIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Stroke>
)
export const CheckIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Stroke>
)
export const ChevronDownIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
  </Stroke>
)
export const ChevronLeftIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M9.75 4.5 6.25 8l3.5 3.5" />
  </Stroke>
)
export const ChevronRightIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M6.25 4.5 9.75 8l-3.5 3.5" />
  </Stroke>
)
export const RefreshIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71" />
    <path d="M13.25 2.75v2.5h-2.5" />
  </Stroke>
)
export const ExternalIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M9.5 2.75h3.75V6.5M13.25 2.75 7.5 8.5" />
    <path d="M11.75 9.5v2.75a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1H6.5" />
  </Stroke>
)
export const LinkIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2-2a2.75 2.75 0 0 0-3.9-3.9l-.6.6" />
    <path d="M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2 2a2.75 2.75 0 0 0 3.9 3.9l.6-.6" />
  </Stroke>
)
export const CommentIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M2.75 4.25a1.5 1.5 0 0 1 1.5-1.5h7.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7.5L4.75 13v-2.25h-.5a1.5 1.5 0 0 1-1.5-1.5z" />
  </Stroke>
)
export const MilestoneIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M3.5 14V2.5M3.5 3h8.25l-1.75 2.75L11.75 8.5H3.5" />
  </Stroke>
)
export const ClockIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Stroke>
)
export const LockIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="3.25" y="7.25" width="9.5" height="6.5" rx="1.5" />
    <path d="M5.25 7.25V5.5a2.75 2.75 0 0 1 5.5 0v1.75" />
  </Stroke>
)
export const IssueOpenIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="8" cy="8" r="5.75" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
  </Stroke>
)
export const IssueClosedIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="m5.5 8.25 1.75 1.75 3.25-3.75" />
  </Stroke>
)
export const UserIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="8" cy="5.5" r="2.75" />
    <path d="M2.75 13.5a5.25 5.25 0 0 1 10.5 0" />
  </Stroke>
)
export const UserPlusIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="6.5" cy="5.5" r="2.75" />
    <path d="M1.75 13.5a4.75 4.75 0 0 1 9.5 0M12.5 4.5v4M10.5 6.5h4" />
  </Stroke>
)
export const UserMinusIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="6.5" cy="5.5" r="2.75" />
    <path d="M1.75 13.5a4.75 4.75 0 0 1 9.5 0M10.5 6.5h4" />
  </Stroke>
)
export const TagIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M2.75 2.75h4.5l6 6-4.5 4.5-6-6z" />
    <circle cx="5.5" cy="5.5" r="0.75" fill="currentColor" />
  </Stroke>
)
export const ColumnsIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="2" y="2.75" width="3.25" height="10.5" rx="1" />
    <rect x="6.375" y="2.75" width="3.25" height="7" rx="1" />
    <rect x="10.75" y="2.75" width="3.25" height="9" rx="1" />
  </Stroke>
)
export const DashboardIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="2.25" y="2.25" width="5" height="5" rx="1.25" />
    <rect x="8.75" y="2.25" width="5" height="5" rx="1.25" />
    <rect x="2.25" y="8.75" width="5" height="5" rx="1.25" />
    <rect x="8.75" y="8.75" width="5" height="5" rx="1.25" />
  </Stroke>
)
export const SunIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
  </Stroke>
)
export const MoonIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85z" />
  </Stroke>
)
export const MonitorIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" />
    <path d="M5.5 13.75h5M8 11.25v2.5" />
  </Stroke>
)
export const SignOutIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M6.25 13.25h-2.5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1h2.5" />
    <path d="M10.5 11 13.5 8l-3-3M13.25 8H6.5" />
  </Stroke>
)
export const KeyboardIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.5" />
    <path d="M4.5 6.5h.01M7 6.5h.01M9.5 6.5h.01M12 6.5h.01M5 9.5h6" />
  </Stroke>
)
export const SlidersIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M2.75 4.5h5.5M11.25 4.5h2M2.75 11.5h2M7.75 11.5h5.5" />
    <circle cx="9.75" cy="4.5" r="1.5" />
    <circle cx="6.25" cy="11.5" r="1.5" />
  </Stroke>
)
export const CollapseIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
    <path d="M6.25 2.25v11.5M10.75 6.25 9 8l1.75 1.75" />
  </Stroke>
)

export const ExpandIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
    <path d="M6.25 2.25v11.5M9.25 6.25 11 8l-1.75 1.75" />
  </Stroke>
)
export const ArrowRightIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Stroke>
)
export const UndoIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M5.25 3.25 2.75 5.75l2.5 2.5" />
    <path d="M2.75 5.75h6.5a4 4 0 0 1 0 8H6.5" />
  </Stroke>
)
export const AlertIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M7.13 2.5 1.6 12a1 1 0 0 0 .87 1.5h11.06a1 1 0 0 0 .87-1.5L8.87 2.5a1 1 0 0 0-1.74 0z" />
    <path d="M8 6.25v3M8 11.25h.01" />
  </Stroke>
)
export const InfoIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 7.25v3.5M8 5.25h.01" />
  </Stroke>
)
export const RepoIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M3.25 12.25V3.75a1.5 1.5 0 0 1 1.5-1.5h8v9.5h-8a1.5 1.5 0 0 0-1.5 1.5zm0 0a1.5 1.5 0 0 0 1.5 1.5h8" />
    <path d="M6 5h3.5" />
  </Stroke>
)

export const PullIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="4" cy="3.5" r="1.75" />
    <circle cx="4" cy="12.5" r="1.75" />
    <circle cx="12" cy="12.5" r="1.75" />
    <path d="M4 5.25v5.5M12 10.75V6a2 2 0 0 0-2-2H7.5M9 2.5 7.5 4 9 5.5" />
  </Stroke>
)

export const BellIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1.25 4.25 1.25 4.25H2.75S4 9.5 4 6.5zM6.5 13a1.6 1.6 0 0 0 3 0" />
  </Stroke>
)

export const PanelIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
    <path d="M9.75 2.25v11.5" />
  </Stroke>
)

export const AtIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M10.5 8v1a1.75 1.75 0 0 0 3.5 0V8a6 6 0 1 0-2.4 4.8" />
  </Stroke>
)

export const ArchiveIcon = ({ className }: IconProps) => (
  <Stroke className={className}>
    <rect x="2" y="2.75" width="12" height="3.5" rx="1" />
    <path d="M3 6.25v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-6M6.5 9h3" />
  </Stroke>
)
