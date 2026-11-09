import type { ReactNode } from "react"
import { AlertIcon } from "./icons.tsx"
import { buttonClass, cardClass } from "./primitives.tsx"

/** Server messages often end without a full stop; every notice reads as sentences. */
export const sentence = (text: string) => (/[.!?…)]$/.test(text.trim()) ? text : `${text.trim()}.`)

/**
 * How every view says something failed or is incomplete: an icon tile, a title, the reason, and
 * "Retry" when trying again can help. `bare` drops the card surface for use inside a card.
 */
export const ErrorNotice = ({
  title,
  children,
  onRetry,
  retrying = false,
  tone = "error",
  bare = false,
  announce = true,
  className = "",
}: {
  title: ReactNode
  /** The reason, usually the server's message. */
  children?: ReactNode
  onRetry?: (() => void) | undefined
  retrying?: boolean
  /** "warning" for a partial result, such as some repositories that could not be read. */
  tone?: "error" | "warning"
  bare?: boolean
  announce?: boolean
  className?: string
}) => (
  <div
    role={announce ? (tone === "error" ? "alert" : "status") : undefined}
    className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${bare ? "" : `${cardClass} px-4 py-4 sm:px-5`} ${className}`}
  >
    <div className="flex min-w-0 flex-1 basis-60 items-start gap-3">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${
          tone === "error"
            ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
            : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
        }`}
      >
        <AlertIcon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
        {children !== undefined && (
          <p className="mt-0.5 text-sm break-words text-zinc-500 dark:text-zinc-400">
            {typeof children === "string" ? sentence(children) : children}
          </p>
        )}
      </div>
    </div>
    {onRetry !== undefined && (
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={`${buttonClass.secondary} max-sm:ml-11`}
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    )}
  </div>
)
