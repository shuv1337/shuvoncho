import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
}

export function DataTable<T>({ rows, columns, empty }: { rows: T[]; columns: Column<T>[]; empty?: string }) {
  if (rows.length === 0) {
    return <div className="empty-state">{empty ?? 'No data available.'}</div>
  }

  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
