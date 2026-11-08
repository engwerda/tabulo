import { createContext, type ReactNode, useContext, useState } from "react"
import { ShowAll } from "./ShowAll.tsx"

/** Rows shown before "Show all": enough for a quarter of weeks, short enough to see the end. */
const SHOWN_ROWS = 14

const Hidden = createContext(false)

/**
 * A chart's table kept for assistive technology while the chart shows. It lists every row, with
 * no "Show all" button that keyboard focus could reach but no one could see.
 */
export const HiddenTable = ({ children }: { children: ReactNode }) => (
  <Hidden.Provider value={true}>
    <div className="sr-only">{children}</div>
  </Hidden.Provider>
)

/** The table view of a chart: every value the chart draws, readable without it. */
export const DataTable = ({
  caption,
  columns,
  rows,
}: {
  readonly caption: string
  readonly columns: ReadonlyArray<string>
  readonly rows: ReadonlyArray<{ readonly key: string; readonly cells: ReadonlyArray<ReactNode> }>
}) => {
  const hidden = useContext(Hidden)
  const [expanded, setExpanded] = useState(false)
  const shown = expanded || hidden ? rows : rows.slice(0, SHOWN_ROWS)
  return (
    <div className="flex flex-col overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={`py-1.5 pr-3 font-medium ${index === 0 ? "" : "text-right"}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {shown.map(({ key, cells }) => (
            <tr key={key}>
              {cells.map((cell, index) =>
                index === 0 ? (
                  <th key={columns[index]} scope="row" className="py-1.5 pr-3 font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={columns[index]} className="py-1.5 pr-3 text-right tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!hidden && rows.length > SHOWN_ROWS && (
        <ShowAll total={rows.length} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      )}
    </div>
  )
}
