import { useState } from "react"
import { initials, repoColor } from "./format.ts"

const SIZES = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-6 text-[0.625rem]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const

/**
 * Falls back to initials when the image fails, which is the norm for private Forgejo
 * instances that refuse cross-site avatar requests.
 */
export const Avatar = ({
  url,
  name,
  size = "md",
  className = "",
}: {
  url: string
  name: string
  size?: keyof typeof SIZES
  className?: string
}) => {
  // Remembers which address failed, so an address that arrives later still gets its chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const failed = url === "" || failedUrl === url
  const box = `${SIZES[size]} shrink-0 rounded-full ${className}`
  if (failed) {
    return (
      <span
        aria-hidden="true"
        style={{ backgroundColor: repoColor(name) }}
        className={`grid ${box} place-items-center font-semibold text-white`}
      >
        {initials(name)}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className={`${box} bg-zinc-200 object-cover dark:bg-zinc-800`}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  )
}

/** Overlapping avatars, the first few of `people`, with a count for the rest. */
export const AvatarStack = ({
  people,
  size = "sm",
  max = 3,
}: {
  people: ReadonlyArray<{ readonly login: string; readonly avatarUrl: string }>
  size?: keyof typeof SIZES
  max?: number
}) => {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <ul className="flex shrink-0 -space-x-1" aria-label="Assignees">
      {shown.map((person) => (
        <li key={person.login} title={person.login} className="flex">
          <span className="sr-only">{person.login}</span>
          <Avatar
            url={person.avatarUrl}
            name={person.login}
            size={size}
            className="ring-2 ring-white dark:ring-zinc-900"
          />
        </li>
      ))}
      {rest > 0 && (
        <li
          title={people
            .slice(max)
            .map((person) => person.login)
            .join(", ")}
          className={`grid ${SIZES[size]} place-items-center rounded-full bg-zinc-200 font-semibold text-zinc-700 ring-2 ring-white dark:bg-zinc-700 dark:text-zinc-200 dark:ring-zinc-900`}
        >
          +{rest}
        </li>
      )}
    </ul>
  )
}
