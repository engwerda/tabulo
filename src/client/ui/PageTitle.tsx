import type { ReactNode } from "react"

/**
 * The title row under an org view's scope bar: the view's name, one line about what is shown,
 * and the view's own controls at the end. The board, a full-height workspace, goes without.
 */
export const PageTitle = ({
  title,
  meta,
  actions,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
}) => (
  <div className="mt-2 mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div className="min-w-0">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {meta !== undefined && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{meta}</p>
      )}
    </div>
    {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
)
