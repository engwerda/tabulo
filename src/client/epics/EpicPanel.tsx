import { Link } from "wouter"
import type { BoardColumn, Epic } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { absoluteTime, relativeTime } from "../format.ts"
import { IssuePanel, Property } from "../issue/IssuePanel.tsx"
import { type PreviewControls, previewLink } from "../issue/use-issue-preview.tsx"
import { IssueRef } from "../ui/IssueRef.tsx"
import { LabelList } from "../ui/LabelChip.tsx"
import { ColumnChip, UNREAD_LINKS } from "./EpicCard.tsx"
import {
  boardCardHref,
  completion,
  type EpicPreview,
  epicRef,
  type LinkedBoard,
  shortRepo,
} from "./epics-view.ts"

const plain = "block px-1.5 py-1"
const muted = "text-zinc-500 dark:text-zinc-400"

type EpicPanelProps = PreviewControls & {
  readonly org: string
  readonly preview: EpicPreview
  readonly columns: ReadonlyArray<BoardColumn>
  /** The organization's last board, for a link to the item's card there. */
  readonly board: LinkedBoard | undefined
}

const Progress = ({ epic, backlinksRead }: { epic: Epic; backlinksRead: boolean }) => (
  <span className={plain}>
    <span className="tabular-nums">
      {epic.progress.total === 0
        ? backlinksRead
          ? "No children"
          : "No children found"
        : `${epic.progress.done} of ${epic.progress.total} done · ${completion(epic.progress)}%`}
    </span>
    {!backlinksRead && (
      <span className={`mt-0.5 block text-xs ${muted}`}>
        {UNREAD_LINKS}, so some children may be missing.
      </span>
    )}
  </span>
)

/**
 * The Epics page's preview of an epic or a child: its description and comments, a comment box,
 * and what the page knows about it, read-only. The board is where its status, assignees, and
 * labels change, so the status links to its card when the last board shows it.
 */
export const EpicPanel = ({
  org,
  preview,
  columns,
  board,
  open,
  close,
  restoreFocus,
}: EpicPanelProps) => {
  const { issue, item, parents } = preview
  const shown = item._tag === "Epic" ? item.epic : item.child
  const repo = shortRepo(org, `${issue.owner}/${issue.repo}`)
  const onBoard = boardCardHref(org, board, shown)
  return (
    <IssuePanel
      issue={issue}
      name={`${repo}#${issue.number}`}
      reference={<IssueRef repo={repo} number={issue.number} className="min-w-0 truncate" />}
      placement="over"
      canComment
      properties={
        <>
          <Property name="Status">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1.5 py-1">
              <ColumnChip column={shown.column} columns={columns} />
              {onBoard !== null && (
                <Link
                  href={onBoard}
                  className="rounded-sm text-xs font-medium text-indigo-700 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center dark:text-indigo-300"
                >
                  Open on board
                </Link>
              )}
            </span>
          </Property>
          {item._tag === "Epic" && (
            <Property name="Progress">
              <Progress epic={item.epic} backlinksRead={item.backlinksRead} />
            </Property>
          )}
          <Property name="Assignees">
            {shown.assignees.length === 0 ? (
              <span className={`${plain} ${muted}`}>Nobody</span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1.5 py-1">
                {shown.assignees.map((person) => (
                  <span key={person.login} className="flex items-center gap-1.5">
                    <Avatar url={person.avatarUrl} name={person.login} size="xs" />
                    {person.login}
                  </span>
                ))}
              </span>
            )}
          </Property>
          {item._tag === "Epic" && (
            <>
              <Property name="Labels">
                {item.epic.labels.length === 0 ? (
                  <span className={`${plain} ${muted}`}>None</span>
                ) : (
                  <LabelList labels={item.epic.labels} size="md" className="px-1.5 py-1" />
                )}
              </Property>
              {item.epic.milestone !== null && (
                <Property name="Milestone">
                  <span className={plain}>{item.epic.milestone}</span>
                </Property>
              )}
              <Property name="Updated">
                <time
                  dateTime={item.epic.updatedAt}
                  title={absoluteTime(item.epic.updatedAt)}
                  className={plain}
                >
                  {relativeTime(item.epic.updatedAt)}
                </time>
              </Property>
            </>
          )}
          {parents.length > 0 && (
            <Property name="Part of">
              <ul>
                {parents.map((parent) => (
                  <li key={parent.key}>
                    <a
                      {...previewLink(epicRef(org, parent), open)}
                      href={parent.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 transition hover:bg-zinc-100 pointer-coarse:min-h-11 pointer-coarse:items-center dark:hover:bg-zinc-800/70"
                    >
                      <IssueRef
                        repo={parent.repo}
                        number={parent.number}
                        className={`shrink-0 text-xs ${muted}`}
                      />
                      <span className="min-w-0 wrap-anywhere">{parent.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Property>
          )}
        </>
      }
      // The Epics page shows no comment counts, so a comment changes nothing on it.
      onCommented={() => {}}
      restoreFocus={restoreFocus}
      onClose={close}
    />
  )
}
