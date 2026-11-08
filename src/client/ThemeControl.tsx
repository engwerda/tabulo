import type { ReactNode } from "react"
import {
  setThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
  useThemePreference,
} from "./theme.ts"
import { MonitorIcon, MoonIcon, SunIcon } from "./ui/icons.tsx"

const OPTIONS: Record<ThemePreference, { label: string; icon: ReactNode }> = {
  system: { label: "System", icon: <MonitorIcon /> },
  light: { label: "Light", icon: <SunIcon /> },
  dark: { label: "Dark", icon: <MoonIcon /> },
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
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition has-focus-visible:outline-2 has-focus-visible:outline-indigo-500 ${
              current === preference
                ? "bg-white text-zinc-900 shadow-card dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
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
            {label}
          </label>
        )
      })}
    </fieldset>
  )
}
