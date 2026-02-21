import React from "react";

export interface DataTableColumn<T> {
  key: keyof T;
  header: string;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  emptyMessage?: string;
}

export function DataTable<T extends object>({ columns, data, emptyMessage = "No data" }: DataTableProps<T>) {
  if (data.length === 0) {
    return <div className="ui-table__empty">{emptyMessage}</div>;
  }

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((col, colIdx) => (
              <th key={`${String(col.key)}-${colIdx}`}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col, colIdx) => (
                <td key={`${String(col.key)}-${colIdx}`}>
                  {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
