import { useState } from "react"
import { initials } from "./format.ts"

/**
 * Falls back to initials when the image fails, which is the norm for private Forgejo
 * instances that refuse cross-site avatar requests.
 */
export const Avatar = ({ url, name }: { url: string; name: string }) => {
  const [failed, setFailed] = useState(url === "")
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100"
      >
        {initials(name)}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="size-8 rounded-full"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
