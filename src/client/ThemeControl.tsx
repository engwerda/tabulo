import type { ReactNode } from "react"
import {
  setThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
  useThemePreference,
} from "./theme.ts"
import { MonitorIcon, MoonIcon, SunIcon } from "./ui/icons.tsx"
import { Segmented } from "./ui/primitives.tsx"

const OPTIONS: Record<ThemePreference, { label: string; icon: ReactNode }> = {
  system: { label: "System", icon: <MonitorIcon className="size-3.5" /> },
  light: { label: "Light", icon: <SunIcon className="size-3.5" /> },
  dark: { label: "Dark", icon: <MoonIcon className="size-3.5" /> },
}

export const ThemeControl = () => (
  <Segmented
    label="Theme"
    size="sm"
    className="w-full [&>button]:flex-1"
    value={useThemePreference()}
    onChange={setThemePreference}
    options={THEME_PREFERENCES.map((preference) => ({
      value: preference,
      label: (
        <>
          {OPTIONS[preference].icon}
          {OPTIONS[preference].label}
        </>
      ),
    }))}
  />
)
