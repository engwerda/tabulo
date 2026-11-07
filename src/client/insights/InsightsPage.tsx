import { ScopeBar } from "../scope/ScopeBar.tsx"
import { useRepoSelection } from "../scope/use-repo-selection.ts"

export const InsightsPage = ({ org }: { org: string }) => {
  const repoSelection = useRepoSelection(org)
  return (
    <main className="py-4">
      <ScopeBar org={org} view="insights" repoSelection={repoSelection} />
      <section className="mx-4 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center sm:mx-6 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Insights are coming soon</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Charts of issue activity across the chosen repositories will appear here.
        </p>
      </section>
    </main>
  )
}
