import { useMutation } from "@tanstack/react-query"
import { useRef } from "react"
import { markNotificationRead, RequestFailed } from "./api.ts"
import type { Preview } from "./dashboard-preview.ts"
import { absoluteTime, relativeTime } from "./format.ts"
import { IssuePanel, Property } from "./issue/IssuePanel.tsx"
import { IssueRef } from "./ui/IssueRef.tsx"
import { CheckIcon } from "./ui/icons.tsx"
import { LabelList } from "./ui/LabelChip.tsx"
import { useToast } from "./ui/toast.tsx"

// A grant made before Tabulo asked for write:notification keeps read:notification.
const SCOPE_MISSING =
  "Your Forgejo sign-in does not let Tabulo change notifications. In Forgejo, revoke Tabulo under Settings > Applications, then sign in again."

const plain = "block px-1.5 py-1"

type DashboardPanelProps = {
  readonly preview: Preview
  /** Runs once Forgejo has marked the notification read. */
  readonly onMarkedRead: (id: number) => void
  readonly onCommented: () => void
  readonly restoreFocus: () => void
  readonly onClose: () => void
}

/**
 * The dashboard's preview of an issue or pull request: its description and comments, a comment
 * box, and Mark read for its unread notification. Key it by the issue, so Mark read starts over
 * for another one.
 */
export const DashboardPanel = ({
  preview,
  onMarkedRead,
  onCommented,
  restoreFocus,
  onClose,
}: DashboardPanelProps) => {
  const toast = useToast()
  const markButton = useRef<HTMLButtonElement>(null)
  const mark = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (_, id) => {
      // The button goes away, so focus that was on it moves to the heading instead of the page.
      if (markButton.current !== null && document.activeElement === markButton.current) {
        markButton.current.closest('[role="dialog"]')?.querySelector<HTMLElement>("h2")?.focus()
      }
      onMarkedRead(id)
    },
    onError: (error) =>
      toast({
        tone: "error",
        title: "Could not mark it read",
        detail:
          error instanceof RequestFailed && error.status === 403 ? SCOPE_MISSING : error.message,
      }),
  })
  const { issue, item, notification } = preview
  const updatedAt = item?.updatedAt ?? notification?.updatedAt
  return (
    <IssuePanel
      issue={issue}
      name={preview.ref}
      reference={
        <IssueRef
          repo={`${issue.owner}/${issue.repo}`}
          number={issue.number}
          className="min-w-0 truncate"
        />
      }
      placement="over"
      canComment
      properties={
        <>
          {item !== null && (
            <>
              <Property name="Labels">
                {item.labels.length === 0 ? (
                  <span className={`${plain} text-zinc-500 dark:text-zinc-400`}>None</span>
                ) : (
                  <LabelList labels={item.labels} size="md" className="px-1.5 py-1" />
                )}
              </Property>
              <Property name="Author">
                <span className={plain}>{item.author}</span>
              </Property>
            </>
          )}
          {updatedAt !== undefined && (
            <Property name="Updated">
              <time dateTime={updatedAt} title={absoluteTime(updatedAt)} className={plain}>
                {relativeTime(updatedAt)}
              </time>
            </Property>
          )}
          {(notification !== null || mark.isSuccess) && (
            <Property name="Notification">
              <span className="flex flex-wrap items-center gap-1">
                <span aria-live="polite" className="px-1.5 py-1">
                  {mark.isSuccess ? "Marked read" : "Unread"}
                </span>
                {notification !== null && !mark.isSuccess && (
                  // Disabling the button would drop its focus to the page while it saves.
                  <button
                    ref={markButton}
                    type="button"
                    aria-disabled={mark.isPending || undefined}
                    onClick={() => {
                      if (!mark.isPending) mark.mutate(notification.id)
                    }}
                    className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 aria-disabled:opacity-60 pointer-coarse:min-h-11 pointer-coarse:px-2.5 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                  >
                    <CheckIcon className="size-3.5" />
                    {mark.isPending ? "Marking read…" : "Mark read"}
                  </button>
                )}
              </span>
            </Property>
          )}
        </>
      }
      onCommented={onCommented}
      restoreFocus={restoreFocus}
      onClose={onClose}
    />
  )
}
