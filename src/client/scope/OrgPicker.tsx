import { useQuery } from "@tanstack/react-query"
import { useId } from "react"
import { Link, Redirect } from "wouter"
import { Avatar } from "../Avatar.tsx"
import { fetchOrgs } from "../api.ts"
import { Glyph } from "../palette/icons.tsx"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import { AlertIcon, CheckIcon, ChevronRightIcon, InfoIcon } from "../ui/icons.tsx"
import { cardClass, Popover } from "../ui/primitives.tsx"
import { rememberedScope } from "./remembered.ts"
import { type OrgViewId, orgView, orgViewHref } from "./views.ts"

export const ORGS = ["orgs"] as const

export const OrgPicker = ({ view }: { view: OrgViewId }) => {
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })
  if (orgs.data?.length === 1 && orgs.data[0] !== undefined) {
    return <Redirect to={orgViewHref(view, rememberedScope(orgs.data[0].name))} replace />
  }
  const { label, icon, pickerHint } = orgView(view)
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <Glyph name={icon} className="size-3.5" />
        {label}
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
        Choose an organization
      </h1>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{pickerHint}</p>
      {orgs.isError ? (
        <ErrorNotice
          title="Could not load your organizations"
          onRetry={() => void orgs.refetch()}
          retrying={orgs.isFetching}
          className="mt-6"
        >
          {orgs.error.message}
        </ErrorNotice>
      ) : orgs.data === undefined ? (
        <div
          role="status"
          className={`${cardClass} mt-6 divide-y divide-zinc-100 dark:divide-zinc-800`}
        >
          <span className="sr-only">Loading organizations</span>
          {[0, 1, 2].map((index) => (
            <div key={index} aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
              <span className="size-10 animate-shimmer rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
              <span className="grid flex-1 gap-1.5">
                <span className="h-3 w-40 animate-shimmer rounded bg-zinc-200/70 dark:bg-zinc-800" />
                <span className="h-2.5 w-20 animate-shimmer rounded bg-zinc-200/50 dark:bg-zinc-800/70" />
              </span>
            </div>
          ))}
        </div>
      ) : orgs.data.length === 0 ? (
        <p
          className={`${cardClass} mt-6 flex items-start gap-3 px-4 py-3.5 text-sm text-zinc-600 dark:text-zinc-400`}
        >
          <InfoIcon className="mt-0.5 size-4 text-zinc-500 dark:text-zinc-400" />
          You are not a member of any organization yet. {label} shows the repositories of one
          organization in Forgejo.
        </p>
      ) : (
        <ul
          className={`${cardClass} mt-6 divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800`}
        >
          {orgs.data.map((org) => (
            <li key={org.name}>
              <Link
                href={orgViewHref(view, rememberedScope(org.name))}
                className="group flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-50 focus-visible:-outline-offset-2 dark:hover:bg-zinc-800/50"
              >
                <Avatar
                  url={org.avatarUrl}
                  name={org.fullName || org.name}
                  size="lg"
                  className="rounded-lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {org.fullName || org.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {org.name}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/** The view's organization, as a menu that switches to the same view of another organization. */
export const OrgSwitcher = ({ org, view }: { org: string; view: OrgViewId }) => {
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })
  const current = orgs.data?.find((candidate) => candidate.name.toLowerCase() === org.toLowerCase())
  const title = current?.fullName || current?.name || org
  const headingId = useId()
  return (
    <Popover
      containerClass="relative -ml-1.5 min-w-0"
      triggerClass="flex w-full min-w-0 items-center gap-2 rounded-lg py-1 pr-1.5 pl-1.5 text-left pointer-coarse:min-h-11 transition hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
      accessibleLabel={`Organization: ${title}. ${
        orgs.isError ? "Could not load your organizations" : "Switch organization"
      }`}
      label={
        orgs.isPending ? (
          // The login would show first and then change to the full name, moving what follows.
          <span aria-hidden="true" className="flex min-w-0 items-center gap-2">
            <span className="size-6 shrink-0 animate-shimmer rounded-md bg-zinc-200/70 dark:bg-zinc-800" />
            <span className="h-4 w-36 min-w-0 animate-shimmer rounded bg-zinc-200/70 max-sm:w-24 dark:bg-zinc-800" />
          </span>
        ) : (
          <>
            {current === undefined && !orgs.isPending ? (
              <span className="grid size-6 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <AlertIcon className="size-3.5" />
              </span>
            ) : (
              <Avatar
                url={current?.avatarUrl ?? ""}
                name={title}
                size="sm"
                className="rounded-md"
              />
            )}
            <span className="truncate text-base font-semibold tracking-tight">{title}</span>
          </>
        )
      }
      panelClass="w-72 p-1.5"
      focusFirstItem
    >
      {(close) => (
        <>
          {orgs.isError && (
            <ErrorNotice
              bare
              tone="warning"
              title="Could not load your organizations"
              onRetry={() => void orgs.refetch()}
              retrying={orgs.isFetching}
              className="px-2 pt-1 pb-2 [&>button]:ml-11"
            >
              {orgs.error.message}
            </ErrorNotice>
          )}
          <p
            hidden={orgs.isError}
            id={headingId}
            className="px-2 pt-1 pb-1.5 text-2xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Organizations
          </p>
          <div role="menu" aria-labelledby={headingId} hidden={orgs.isError}>
            {(orgs.data ?? []).map((candidate) => {
              const active = candidate.name.toLowerCase() === org.toLowerCase()
              return (
                <Link
                  key={candidate.name}
                  href={orgViewHref(view, rememberedScope(candidate.name))}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={close}
                  // A menu item answers Space as well as Enter, as the app's other menus do.
                  onKeyDown={(event) => {
                    if (event.key !== " ") return
                    event.preventDefault()
                    event.currentTarget.click()
                  }}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-zinc-700 transition pointer-coarse:min-h-11 hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none aria-checked:font-medium aria-checked:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800 dark:aria-checked:text-zinc-50"
                >
                  <Avatar
                    url={candidate.avatarUrl}
                    name={candidate.fullName || candidate.name}
                    size="sm"
                    className="rounded-md"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.fullName || candidate.name}
                  </span>
                  {active && <CheckIcon className="size-4 text-indigo-600 dark:text-indigo-400" />}
                </Link>
              )
            })}
          </div>
          {orgs.isPending && (
            <p role="status" className="px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              Loading…
            </p>
          )}
        </>
      )}
    </Popover>
  )
}
