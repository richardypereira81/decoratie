function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function Toolbar({
  actions,
  className = '',
  filters,
  recordCount = null,
  recordLabel = 'Nº registros',
  search,
}) {
  const showRecordCount = Number.isFinite(recordCount)

  return (
    <div className={joinClassNames('admin-list-toolbar', className)}>
      <div className="admin-list-toolbar-search">{search}</div>

      <div className="admin-list-toolbar-controls">
        {filters}
        {showRecordCount ? (
          <div
            className="admin-toolbar-records"
            aria-label={`${recordLabel}: ${recordCount}`}
          >
            <span>{recordLabel}</span>
            <strong>{recordCount}</strong>
          </div>
        ) : null}
        {actions}
      </div>
    </div>
  )
}
