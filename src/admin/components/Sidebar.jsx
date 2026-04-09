import { NavLink } from 'react-router-dom'
import {
  CloseIcon,
  DashboardIcon,
  LeadsIcon,
  LogoutIcon,
  OperationIcon,
  ProductsIcon,
  SettingsIcon,
} from './AdminIcons.jsx'

const navigationItems = [
  {
    to: '/admin',
    label: 'Dashboard',
    end: true,
    icon: DashboardIcon,
  },
  {
    to: '/admin/produtos',
    label: 'Produtos',
    icon: ProductsIcon,
  },
  {
    to: '/admin/operacao',
    label: 'Operacao',
    icon: OperationIcon,
  },
  {
    to: '/admin/leads',
    label: 'Leads',
    icon: LeadsIcon,
  },
  {
    to: '/admin/configuracoes',
    label: 'Configuracoes',
    icon: SettingsIcon,
  },
]

export default function Sidebar({ open, onClose, onLogout }) {
  return (
    <aside
      id="admin-sidebar"
      className={`admin-sidebar ${open ? 'is-open' : ''}`}
      data-lenis-prevent
    >
      <div className="admin-sidebar-shell">
        <div className="admin-sidebar-head">
          <div>
            <span className="admin-kicker">Painel interno</span>
            <div className="admin-brand">Decoratie</div>
          </div>

          <button
            type="button"
            className="admin-icon-btn admin-sidebar-close"
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <CloseIcon className="admin-inline-icon" />
          </button>
        </div>

        <nav className="admin-nav" aria-label="Menu principal">
          {navigationItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}
              >
                <span className="admin-nav-icon">
                  <Icon className="admin-inline-icon" />
                </span>
                <span className="admin-nav-label">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-logout-btn"
            onClick={onLogout}
          >
            <LogoutIcon className="admin-inline-icon" />
            <span>Sair do painel</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
