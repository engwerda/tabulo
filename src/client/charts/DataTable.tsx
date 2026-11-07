import type { ReactNode } from "react"

/** The table view of a chart: every value the chart draws, readable without it. */
export const DataTable = ({
  caption,
  columns,
  rows,
}: {
  readonly caption: string
  readonly columns: ReadonlyArray<string>
  readonly rows: ReadonlyArray<{ readonly key: string; readonly cells: ReadonlyArray<ReactNode> }>
}) => (
  <div className="max-h-80 overflow-auto">
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
        {rows.map(({ key, cells }) => (
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
  </div>
)
