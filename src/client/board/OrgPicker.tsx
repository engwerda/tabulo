import { useQuery } from "@tanstack/react-query"
import { Link, Redirect } from "wouter"
import type { Org } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { fetchOrgs } from "../api.ts"
import { AlertIcon, CheckIcon, ChevronRightIcon } from "../ui/icons.tsx"
import { Popover } from "../ui/primitives.tsx"

export const ORGS = ["orgs"] as const

const orgHref = (org: Org) => `/board/${encodeURIComponent(org.name)}`

export const OrgPicker = () => {
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })
  if (orgs.data?.length === 1 && orgs.data[0] !== undefined) {
    return <Redirect to={orgHref(orgs.data[0])} replace />
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Choose an organization</h1>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        A board shows the issues of chosen repositories in one organization.
      </p>
      {orgs.isError ? (
        <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">
          Could not load your organizations: {orgs.error.message}
        </p>
      ) : orgs.data === undefined ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <li
              key={index}
              className="h-[4.5rem] animate-shimmer rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </ul>
      ) : orgs.data.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          You are not a member of any organization. Boards belong to organizations in Forgejo.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {orgs.data.map((org) => (
            <li key={org.name}>
              <Link
                href={orgHref(org)}
                className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3.5 shadow-card transition hover:-translate-y-px hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/60"
              >
                <Avatar url={org.avatarUrl} name={org.fullName || org.name} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {org.fullName || org.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {org.name}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 dark:text-zinc-600" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/** The board's organization, as a menu that switches to another organization's board. */
export const OrgSwitcher = ({ org }: { org: string }) => {
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })
  const current = orgs.data?.find((candidate) => candidate.name.toLowerCase() === org.toLowerCase())
  const title = current?.fullName || current?.name || org
  return (
    <Popover
      containerClass="relative -ml-1.5 min-w-0"
      triggerClass="flex w-full min-w-0 items-center gap-2 rounded-lg py-1 pr-1.5 pl-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
      accessibleLabel={`Organization: ${title}. Switch organization`}
      label={
        <>
          {current === undefined && orgs.data !== undefined ? (
            <span className="grid size-6 place-items-center rounded-md bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
              <AlertIcon className="size-3.5" />
            </span>
          ) : (
            <Avatar url={current?.avatarUrl ?? ""} name={title} size="sm" className="rounded-md" />
          )}
          <span className="truncate text-base font-semibold tracking-tight">{title}</span>
        </>
      }
      panelClass="w-72 p-1.5"
    >
      {(close) => (
        <nav aria-label="Organizations">
          <p className="px-2 pt-1 pb-1.5 text-[0.6875rem] font-semibold tracking-wide text-zinc-400 uppercase">
            Organizations
          </p>
          <ul>
            {(orgs.data ?? []).map((candidate) => {
              const active = candidate.name.toLowerCase() === org.toLowerCase()
              return (
                <li key={candidate.name}>
                  <Link
                    href={orgHref(candidate)}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                    {active && <CheckIcon className="size-4 text-indigo-600" />}
                  </Link>
                </li>
              )
            })}
          </ul>
          {orgs.isPending && <p className="px-2 py-1.5 text-sm text-zinc-500">Loading…</p>}
        </nav>
      )}
    </Popover>
  )
}
