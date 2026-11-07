import { useQuery } from "@tanstack/react-query"
import { Link, Redirect } from "wouter"
import { Avatar } from "../Avatar.tsx"
import { fetchOrgs } from "../api.ts"
import { type OrgViewId, orgView, orgViewHref } from "./views.ts"

export const ORGS = ["orgs"] as const

export const OrgPicker = ({ view }: { view: OrgViewId }) => {
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })
  if (orgs.data?.length === 1 && orgs.data[0] !== undefined) {
    return <Redirect to={orgViewHref(view, orgs.data[0].name)} replace />
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold">Choose an organization</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{orgView(view).pickerHint}</p>
      {orgs.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          Could not load your organizations: {orgs.error.message}
        </p>
      ) : orgs.data === undefined ? (
        <p className="mt-4 text-sm text-zinc-500">Loading organizations…</p>
      ) : orgs.data.length === 0 ? (
        <p className="mt-4 text-sm">You are not a member of any organization.</p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {orgs.data.map((org) => (
            <li key={org.name}>
              <Link
                href={orgViewHref(view, org.name)}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500"
              >
                <Avatar url={org.avatarUrl} name={org.fullName || org.name} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {org.fullName || org.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {org.name}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
