import type { ReactNode } from "react"

const Icon = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ?? "size-4"}
  >
    {children}
  </svg>
)

export const SearchIcon = ({ className }: { className?: string }) => (
  <Icon {...(className === undefined ? {} : { className })}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13.25 13.25 3.25 3.25" />
  </Icon>
)

const GLYPHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="6" height="7" rx="1.25" />
      <rect x="11" y="3" width="6" height="4" rx="1.25" />
      <rect x="11" y="9" width="6" height="8" rx="1.25" />
      <rect x="3" y="12" width="6" height="5" rx="1.25" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="3.5" width="4" height="13" rx="1.25" />
      <rect x="8.5" y="3.5" width="4" height="8" rx="1.25" />
      <rect x="14" y="3.5" width="3" height="10.5" rx="1.25" />
    </>
  ),
  insights: (
    <>
      <path d="M3.5 3.5v13h13" />
      <path d="m6.5 12.5 3-3.5 2.5 2 4-5" />
    </>
  ),
  epics: (
    <>
      <path d="M4 16.5V3.5" />
      <path d="M4 4h10l-2 3 2 3H4" />
    </>
  ),
  repository: (
    <>
      <path d="M5 3.5h9.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5Z" />
      <path d="M3.5 14a1.5 1.5 0 0 1 1.5-1.5h10.5M7.5 6.5h4" />
    </>
  ),
  external: (
    <>
      <path d="M8 4.5H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16.5h9a1.5 1.5 0 0 0 1.5-1.5v-3" />
      <path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5" />
    </>
  ),
  system: (
    <>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
      <path d="M7 16.5h6M10 13.5v3" />
    </>
  ),
  light: (
    <>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1.06 1.06M14.24 14.24l1.06 1.06M4.7 15.3l1.06-1.06M14.24 5.76l1.06-1.06" />
    </>
  ),
  dark: <path d="M16.5 12.2A6.75 6.75 0 0 1 7.8 3.5a6.75 6.75 0 1 0 8.7 8.7Z" />,
  link: (
    <>
      <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24L10 5.5" />
      <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24L10 14.5" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="5" width="15" height="10" rx="1.75" />
      <path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M6.5 12h7" />
    </>
  ),
  signout: (
    <>
      <path d="M8 3.5H5.5A1.5 1.5 0 0 0 4 5v10a1.5 1.5 0 0 0 1.5 1.5H8" />
      <path d="M12 6.5 15.5 10 12 13.5M15.5 10H8" />
    </>
  ),
  issue: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="1.25" fill="currentColor" />
    </>
  ),
  pull: (
    <>
      <circle cx="5" cy="4.5" r="1.75" />
      <circle cx="5" cy="15.5" r="1.75" />
      <circle cx="15" cy="15.5" r="1.75" />
      <path d="M5 6.25v7.5M15 13.75V8a2.5 2.5 0 0 0-2.5-2.5H10M11.75 3.75 10 5.5l1.75 1.75" />
    </>
  ),
  recent: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5V10l2.5 1.5" />
    </>
  ),
} as const

export type GlyphName = keyof typeof GLYPHS

export const Glyph = ({ name, className }: { name: GlyphName; className?: string }) => (
  <Icon {...(className === undefined ? {} : { className })}>{GLYPHS[name]}</Icon>
)
