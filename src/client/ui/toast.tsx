import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react"
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "./icons.tsx"

type Tone = "success" | "info" | "warning" | "error"

export type ToastInput = {
  readonly tone: Tone
  readonly title: string
  readonly detail?: string
  readonly action?: { readonly label: string; readonly run: () => void }
}

type Toast = ToastInput & { readonly id: number }

const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)

const DURATION_MS: Record<Tone, number> = {
  success: 6000,
  info: 6000,
  warning: 10_000,
  error: 12_000,
}

const TONE_ICON: Record<Tone, ReactNode> = {
  success: (
    <span className="grid size-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      <CheckIcon className="size-3.5" />
    </span>
  ),
  info: <InfoIcon className="size-5 text-indigo-500" />,
  warning: <AlertIcon className="size-5 text-amber-500" />,
  error: <AlertIcon className="size-5 text-red-500" />,
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
      setToasts((current) => [...current.slice(-1), { ...input, id }])
      schedule(id, input.tone)
    },
    [schedule],
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
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3 pr-2 text-sm shadow-pop backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95"
          >
            <span className="mt-px">{TONE_ICON[toast.tone]}</span>
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
                className="-my-0.5 shrink-0 rounded-md px-2 py-1 font-medium text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="-my-0.5 grid size-6 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  )
}
