import { ChevronDownIcon, FilterIcon } from './AdminIcons.jsx'
import ToolbarDropdown from './ToolbarDropdown.jsx'

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function FilterButton({
  activeCount = 0,
  disabled = false,
  label = 'Filtros',
  onClear,
  sections = [],
}) {
  return (
    <ToolbarDropdown
      className="admin-toolbar-control"
      panelClassName="admin-filter-popover"
      renderButton={({ open, panelId, toggle }) => (
        <button
          type="button"
          className={joinClassNames('admin-toolbar-trigger', open ? 'is-active' : '')}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="dialog"
          disabled={disabled}
        >
          <FilterIcon className="admin-inline-icon" />
          <span>{label}</span>
          {activeCount ? <span className="admin-toolbar-count">{activeCount}</span> : null}
          <ChevronDownIcon className="admin-inline-icon admin-toolbar-chevron" />
        </button>
      )}
    >
      <div className="admin-filter-panel">
        {sections.length ? (
          sections.map((section) => (
            <section key={section.id || section.title} className="admin-filter-section">
              <div className="admin-filter-section-head">
                <strong>{section.title}</strong>
                {section.helperText ? <span>{section.helperText}</span> : null}
              </div>

              <div className="admin-filter-options">
                {section.options.map((option) => {
                  const Icon = option.icon

                  return (
                    <button
                      key={option.id || option.value || option.label}
                      type="button"
                      className={joinClassNames(
                        'admin-filter-chip',
                        option.selected ? 'is-selected' : '',
                        option.disabled ? 'is-disabled' : ''
                      )}
                      onClick={option.onSelect}
                      aria-pressed={option.selected}
                      disabled={option.disabled}
                    >
                      {Icon ? <Icon className="admin-inline-icon" /> : null}
                      <span>{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        ) : (
          <p className="admin-filter-empty">Os filtros desta tela serao configurados em seguida.</p>
        )}

        {activeCount && onClear ? (
          <div className="admin-filter-footer">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={onClear}>
              Limpar filtros
            </button>
          </div>
        ) : null}
      </div>
    </ToolbarDropdown>
  )
}
