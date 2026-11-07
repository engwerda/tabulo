import { useState } from "react"
import { initials } from "./format.ts"

/**
 * Falls back to initials when the image fails, which is the norm for private Forgejo
 * instances that refuse cross-site avatar requests.
 */
export const Avatar = ({
  url,
  name,
  size = "md",
}: {
  url: string
  name: string
  size?: "sm" | "md"
}) => {
  const [failed, setFailed] = useState(url === "")
  const box = size === "sm" ? "size-6 text-[0.625rem]" : "size-8 text-xs"
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`grid ${box} place-items-center rounded-full bg-indigo-100 font-semibold text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100`}
      >
        {initials(name)}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className={`${box} rounded-full`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
