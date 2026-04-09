import { MoreIcon } from './AdminIcons.jsx'
import ToolbarDropdown from './ToolbarDropdown.jsx'

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function ActionsDropdown({
  ariaLabel = 'Abrir acoes da lista',
  items = [],
}) {
  return (
    <ToolbarDropdown
      className="admin-toolbar-control"
      panelClassName="admin-actions-popover"
      renderButton={({ open, panelId, toggle }) => (
        <button
          type="button"
          className={joinClassNames('admin-toolbar-trigger', 'admin-toolbar-trigger-icon', open ? 'is-active' : '')}
          onClick={toggle}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="menu"
        >
          <MoreIcon className="admin-inline-icon" />
        </button>
      )}
    >
      {({ close }) => (
        <div className="admin-actions-menu" role="menu">
          {items.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.id || item.label}
                type="button"
                className={joinClassNames(
                  'admin-actions-item',
                  item.tone ? `is-${item.tone}` : '',
                  item.disabled ? 'is-disabled' : ''
                )}
                onClick={() => {
                  if (item.disabled) {
                    return
                  }

                  item.onSelect?.()
                  close()
                }}
                disabled={item.disabled}
                role="menuitem"
              >
                <span className="admin-actions-item-icon">
                  {Icon ? <Icon className="admin-inline-icon" /> : null}
                </span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </ToolbarDropdown>
  )
}
