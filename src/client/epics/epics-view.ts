import type { Epic } from "../../shared/api.ts"

export const completion = ({ total, done }: Pick<Epic["progress"], "total" | "done">) =>
  total === 0 ? 0 : Math.round((done / total) * 100)

export const readEpicFilters = (params: URLSearchParams) => {
  const state = params.get("state")
  const sort = params.get("sort")
  return {
    text: params.get("q") ?? "",
    state: state === "open" || state === "closed" ? state : "",
    assignee: params.get("assignee") ?? "",
    sort: sort === "progress" || sort === "children" ? sort : "updated",
  }
}

export const visibleEpics = (epics: ReadonlyArray<Epic>, params: URLSearchParams) => {
  const filters = readEpicFilters(params)
  const text = filters.text.trim().toLowerCase()
  return epics
    .filter(
      (epic) =>
        (filters.state === "" || epic.state === filters.state) &&
        (filters.assignee === "" ||
          epic.assignees.some(({ login }) => login === filters.assignee)) &&
        (text === "" ||
          epic.title.toLowerCase().includes(text) ||
          `${epic.repo}#${epic.number}`.toLowerCase().includes(text)),
    )
    .sort((a, b) => {
      const difference =
        filters.sort === "progress"
          ? (b.progress.total === 0 ? 0 : b.progress.done / b.progress.total) -
            (a.progress.total === 0 ? 0 : a.progress.done / a.progress.total)
          : filters.sort === "children"
            ? b.progress.total - a.progress.total
            : 0
      return difference || b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key)
    })
}

export const epicSummary = (epics: ReadonlyArray<Epic>) => {
  const total = epics.reduce((sum, epic) => sum + epic.progress.total, 0)
  const done = epics.reduce((sum, epic) => sum + epic.progress.done, 0)
  return {
    total,
    done,
    percent: completion({ total, done }),
    atRisk: epics.filter((epic) => epic.state === "open" && epic.progress.done === 0).length,
  }
}
