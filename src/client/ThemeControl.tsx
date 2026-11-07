import type { ReactNode } from "react"
import {
  setThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
  useThemePreference,
} from "./theme.ts"

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
  >
    {children}
  </svg>
)

const OPTIONS: Record<ThemePreference, { label: string; icon: ReactNode }> = {
  system: {
    label: "System",
    icon: (
      <Icon>
        <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
        <path d="M7 16.5h6M10 13.5v3" />
      </Icon>
    ),
  },
  light: {
    label: "Light",
    icon: (
      <Icon>
        <circle cx="10" cy="10" r="3.25" />
        <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1.06 1.06M14.24 14.24l1.06 1.06M4.7 15.3l1.06-1.06M14.24 5.76l1.06-1.06" />
      </Icon>
    ),
  },
  dark: {
    label: "Dark",
    icon: (
      <Icon>
        <path d="M16.5 12.2A6.75 6.75 0 0 1 7.8 3.5a6.75 6.75 0 1 0 8.7 8.7Z" />
      </Icon>
    ),
  },
}

export const ThemeControl = () => {
  const current = useThemePreference()
  return (
    <fieldset className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      <legend className="sr-only">Theme</legend>
      {THEME_PREFERENCES.map((preference) => {
        const { label, icon } = OPTIONS[preference]
        return (
          <label
            key={preference}
            title={label}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-zinc-500 transition-colors hover:text-zinc-900 has-checked:bg-white has-checked:text-zinc-900 has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-100 dark:has-checked:bg-zinc-950 dark:has-checked:text-zinc-100"
          >
            <input
              type="radio"
              name="theme"
              value={preference}
              checked={current === preference}
              onChange={() => setThemePreference(preference)}
              className="sr-only"
            />
            {icon}
            <span className="sr-only">{label}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
