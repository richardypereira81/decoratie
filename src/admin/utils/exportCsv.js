function escapeCsvValue(value) {
  return `"${String(value ?? '')
    .replace(/"/g, '""')
    .replace(/\r?\n/g, ' ')}"`
}

export function downloadCsv({ columns, filename, rows }) {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(';')
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const value = typeof column.value === 'function' ? column.value(row) : row[column.key]
        return escapeCsvValue(value)
      })
      .join(';')
  )
  const csvContent = `\uFEFF${[header, ...body].join('\r\n')}`
  const blob = new window.Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
