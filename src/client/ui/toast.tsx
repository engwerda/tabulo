import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react"
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "./icons.tsx"
import { buttonClass, panelClass } from "./primitives.tsx"

type Tone = "success" | "info" | "warning" | "error"

export type ToastInput = {
  readonly tone: Tone
  readonly title: ReactNode
  readonly detail?: string
  readonly action?: { readonly label: string; readonly run: () => void }
  /**
   * What the toast is about, such as one card. A new toast with the same key replaces the
   * earlier one, so an older Undo cannot act on a state that a later change replaced.
   */
  readonly key?: string
}

type Toast = ToastInput & { readonly id: number }

/** Shows a toast and returns a function that dismisses it early. */
const ToastContext = createContext<(toast: ToastInput) => () => void>(() => () => {})

export const useToast = () => useContext(ToastContext)

const DURATION_MS: Record<Tone, number> = {
  success: 6000,
  info: 6000,
  warning: 10_000,
  error: 12_000,
}

const TONE_ICON: Record<Tone, ReactNode> = {
  success: (
    <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950">
      <CheckIcon className="size-3" />
    </span>
  ),
  info: <InfoIcon className="size-5 text-zinc-500 dark:text-zinc-400" />,
  warning: <AlertIcon className="size-5 text-amber-600 dark:text-amber-400" />,
  error: <AlertIcon className="size-5 text-red-600 dark:text-red-400" />,
}

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ReadonlyArray<Toast>>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const schedule = useCallback(
    (id: number, tone: Tone) => {
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[tone]),
      )
    },
    [dismiss],
  )

  const show = useCallback(
    (input: ToastInput) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((current) => [
        ...current.filter((toast) => input.key === undefined || toast.key !== input.key).slice(-1),
        { ...input, id },
      ])
      schedule(id, input.tone)
      return () => dismiss(id)
    },
    [schedule, dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3 sm:top-auto sm:bottom-0 sm:p-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" || toast.tone === "warning" ? "alert" : "status"}
            onPointerEnter={() => clearTimeout(timers.current.get(toast.id))}
            onPointerLeave={() => schedule(toast.id, toast.tone)}
            className={`${panelClass} pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 py-2.5 pr-2 pl-3 text-sm`}
          >
            <span className="mt-px flex shrink-0">{TONE_ICON[toast.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{toast.title}</p>
              {toast.detail !== undefined && (
                <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{toast.detail}</p>
              )}
            </div>
            {toast.action !== undefined && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run()
                  dismiss(toast.id)
                }}
                className="-my-1 inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 font-medium text-zinc-900 ring-1 ring-zinc-200 transition hover:bg-zinc-100 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className={`${buttonClass.iconSmall} -my-1`}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  )
}
