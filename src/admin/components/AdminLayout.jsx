import { createContext, useContext, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuthSession } from '../AuthContext.jsx'
import { MenuIcon } from './AdminIcons.jsx'
import Sidebar from './Sidebar.jsx'
import ToastViewport from './ToastViewport.jsx'

const AdminUIContext = createContext(null)

export function useAdminUI() {
  const value = useContext(AdminUIContext)

  if (!value) {
    throw new Error('useAdminUI deve ser usado dentro do AdminLayout.')
  }

  return value
}

export default function AdminLayout() {
  const location = useLocation()
  const { signOutUser } = useAuthSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    document.body.classList.add('admin-mode')
    return () => {
      document.body.classList.remove('admin-mode')
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('admin-nav-open', sidebarOpen)

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setSidebarOpen(false)
      }
    }

    if (sidebarOpen) {
      window.addEventListener('keydown', onKeyDown)
    }

    return () => {
      document.body.classList.remove('admin-nav-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [sidebarOpen])

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  function notify({ type = 'success', title, description = '' }) {
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`

    setToasts((current) => [...current, { id, type, title, description }])
    window.setTimeout(() => dismissToast(id), 4200)
  }

  function handleSignOut() {
    setSidebarOpen(false)
    signOutUser()
  }

  return (
    <AdminUIContext.Provider value={{ notify }}>
      <div className="admin-layout">
        <button
          type="button"
          className={`admin-mobile-toggle ${sidebarOpen ? 'is-hidden' : ''}`}
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menu"
          aria-controls="admin-sidebar"
          aria-expanded={sidebarOpen}
        >
          <MenuIcon className="admin-inline-icon" />
        </button>

        <div
          className={`admin-sidebar-backdrop ${sidebarOpen ? 'is-visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleSignOut}
        />

        <main className="admin-content">
          <div className="admin-main-inner">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                className="admin-page"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </AdminUIContext.Provider>
  )
}
