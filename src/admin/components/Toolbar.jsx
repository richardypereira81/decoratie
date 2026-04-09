function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function Toolbar({ actions, className = '', filters, search }) {
  return (
    <div className={joinClassNames('admin-list-toolbar', className)}>
      <div className="admin-list-toolbar-search">{search}</div>

      <div className="admin-list-toolbar-controls">
        {filters}
        {actions}
      </div>
    </div>
  )
}
