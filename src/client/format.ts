const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

export const relativeTime = (iso: string, now: number = Date.now()) => {
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return "just now"
}

export const absoluteTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export const textColorOn = (hex: string) => {
  const digits = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (digits === undefined) return "#000000"
  const channel = (offset: number) => {
    const value = Number.parseInt(digits.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.179 ? "#000000" : "#ffffff"
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
