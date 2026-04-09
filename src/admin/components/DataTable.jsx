function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

function renderStateContent(content) {
  return typeof content === 'string' ? <p>{content}</p> : content
}

export default function DataTable({
  caption,
  className = '',
  columns,
  emptyState = 'Nenhum registro encontrado.',
  loading = false,
  loadingState = 'Carregando registros...',
  rowClassName,
  rowKey = 'id',
  rows,
}) {
  const resolvedRows = Array.isArray(rows) ? rows : []

  if (loading) {
    return (
      <div className={joinClassNames('admin-table-container', className)}>
        <div className="admin-empty-state admin-table-state">
          {renderStateContent(loadingState)}
        </div>
      </div>
    )
  }

  if (!resolvedRows.length) {
    return (
      <div className={joinClassNames('admin-table-container', className)}>
        <div className="admin-empty-state admin-table-state">
          {renderStateContent(emptyState)}
        </div>
      </div>
    )
  }

  return (
    <div className={joinClassNames('admin-table-container', className)}>
      <div className="admin-table-wrap">
        <table className="admin-table">
          {caption ? <caption className="sr-only">{caption}</caption> : null}

          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.headerClassName}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {resolvedRows.map((row, rowIndex) => {
              const resolvedKey = typeof rowKey === 'function' ? rowKey(row, rowIndex) : row[rowKey]
              const resolvedRowClassName = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName

              return (
                <tr key={resolvedKey} className={resolvedRowClassName}>
                  {columns.map((column) => {
                    const resolvedCellClassName =
                      typeof column.cellClassName === 'function'
                        ? column.cellClassName(row)
                        : column.cellClassName

                    return (
                      <td
                        key={column.key}
                        data-label={column.mobileLabel || column.header}
                        className={resolvedCellClassName}
                      >
                        {column.cell(row, rowIndex)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
